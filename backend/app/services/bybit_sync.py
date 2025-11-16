from __future__ import annotations

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote
from collections import defaultdict

from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import Session

from .. import models
from ..bybit_v5_data import BybitV5Data
from ..services.positions import reconcile_symbol
from ..services.metrics import _slippage_entry_exit_usdt


# ============================================================
# Utils
# ============================================================

def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _dt_ms(ms: Optional[int]) -> Optional[datetime]:
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    except Exception:
        return None


def _f(x) -> float:
    try:
        return float(x or 0.0)
    except Exception:
        return 0.0


def _deep_unquote(s: Optional[str]) -> Optional[str]:
    if not s:
        return s
    prev = s
    for _ in range(5):
        cur = unquote(prev)
        if cur == prev:
            break
        prev = cur
    return prev


def _uid_from_link(exchange_order_id: Optional[str]) -> Optional[str]:
    """# ADDED: extrahiert trade_uid aus orderLinkId 'entry-<uid>' oder 'slsl-<uid>'"""
    if not exchange_order_id or not isinstance(exchange_order_id, str):
        return None
    if exchange_order_id.startswith("entry-") or exchange_order_id.startswith("slsl-"):
        try:
            return exchange_order_id.split("-", 1)[1]
        except Exception:
            return None
    return None

def _uid_from_any(order_link_id: Optional[str], exchange_order_id: Optional[str]) -> Optional[str]:
    if order_link_id:
        return _uid_from_link(order_link_id)
    if exchange_order_id:
        # Wenn deine trade_uid nicht aus exchange_order_id rekonstruierbar ist,
        # lieber None zurückgeben. Mapping auf TvSignal klappt dann ggf. nicht.
        return None
    return None


# ============================================================
# Bot + Keys
# ============================================================

def _get_bot(db: Session, bot_id: int) -> models.Bot | None:
    return (
        db.query(models.Bot)
        .filter(models.Bot.id == bot_id, models.Bot.is_deleted == False)
        .first()
    )


def _get_keys(bot: models.Bot) -> tuple[str, str]:
    key = getattr(bot, "api_key", None)
    sec = getattr(bot, "api_secret", None)
    if not key or not sec:
        raise ValueError("Bot has no API key/secret configured")
    return key, sec


# ============================================================
# Symbol Discovery (lineare USDT Perps)
# ============================================================

def _load_all_linear_usdt_symbols(client: BybitV5Data) -> List[str]:
    out: List[str] = []
    cursor = None
    while True:
        res = client.instruments_info(category="linear", cursor=cursor, limit=1000)
        data = (res.get("result") or {})
        items = (data.get("list") or [])
        for it in items:
            sym = (it.get("symbol") or "").strip()
            quote = (it.get("quoteCoin") or "").upper()
            status = (it.get("status") or "").lower()
            ctype = (it.get("contractType") or "").lower()
            if sym and quote == "USDT" and status == "trading" and "perpetual" in ctype:
                out.append(sym)
        cursor = data.get("nextPageCursor")
        if not cursor:
            break

    # Fallback auf deine 12 Paare
    if not out:
        out = [
            "BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT",
            "DOGEUSDT", "ADAUSDT", "LTCUSDT", "XLMUSDT", "LINKUSDT",
            "AVAXUSDT", "TRXUSDT",
        ]

    # duplikate entfernen + sortieren
    return sorted(list(dict.fromkeys(out)))


# ============================================================
# Bybit Fetches
# ============================================================

def _fetch_executions(
    client: BybitV5Data,
    symbol: str,
    start_ms: Optional[int],
    end_ms: Optional[int],
    max_pages: int = 20,
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    cursor = None
    for _ in range(max_pages):
        safe_cursor = _deep_unquote(cursor)
        res = client.executions(
            category="linear",
            symbol=symbol,
            startTime=start_ms,
            endTime=end_ms,
            limit=100,
            cursor=safe_cursor,
        )
        data = res.get("result") or {}
        lst = data.get("list") or []
        if lst:
            items.extend(lst)
        cursor = data.get("nextPageCursor")
        if not cursor:
            break
    return items


def _fetch_funding_tx(
    client: BybitV5Data,
    start_ms: Optional[int],
    end_ms: Optional[int],
    max_pages: int = 20,
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    cursor = None
    for _ in range(max_pages):
        safe_cursor = _deep_unquote(cursor)
        res = client.transaction_log(
            accountType="UNIFIED",
            category="linear",
            currency="USDT",
            startTime=start_ms,
            endTime=end_ms,
            limit=50,
            cursor=safe_cursor,
        )
        data = res.get("result") or {}
        lst = data.get("list") or []
        if lst:
            items.extend(lst)
        cursor = data.get("nextPageCursor")
        if not cursor:
            break
    return items


# ============================================================
# Persist-Helfer (mit Dedupe!)
# ============================================================

def _persist_execution(
    db: Session,
    bot_id: int,
    symbol: str,
    side: str,
    price: float,
    qty: float,
    fee: float,
    is_closing: bool,
    liq: str,
    ts: Optional[datetime],
    payload: Dict[str, Any],
):
    """
    Speichert eine Execution, aber nur wenn wir sie noch nicht haben.
    Schlüssel: (bot_id, exchange_exec_id)
    """
    exec_id = payload.get("execId") or payload.get("executionId")
    if exec_id:
        exists = (
            db.query(models.Execution)
            .filter(
                models.Execution.bot_id == bot_id,
                models.Execution.exchange_exec_id == exec_id,
            )
            .first()
        )
        if exists:
            return  # schon da
    def _g(d, *keys):
        for k in keys:
            v = d.get(k)
            if v not in (None, ""):
                return v
        return None

    ex = models.Execution(
        bot_id=bot_id,
        symbol=symbol,
        side=side,
        price=price,
        qty=qty,
        fee_usdt=fee,
        fee_currency="USDT",
        reduce_only=is_closing,
        liquidity=liq,
        ts=ts,
        # für späteres Debug / Zuordnung:
        exchange_exec_id=exec_id,
        exchange_order_id=_g(payload, "orderId", "orderID", "exchangeOrderId", "order_id"),
        order_link_id=_g(payload, "orderLinkId", "orderLinkID"),
    )
    db.add(ex)


def _persist_funding_event(db: Session, bot_id: int, ev: Dict[str, Any]):
    typ = (ev.get("type") or ev.get("category") or "").lower()
    if "funding" not in typ:
        return
    fe = models.FundingEvent(
        bot_id=bot_id,
        symbol=(ev.get("symbol") or ""),
        amount_usdt=_f(ev.get("amount")),
        rate=_f(ev.get("feeRate") or ev.get("rate")),
        ts=_dt_ms(ev.get("timestamp") or ev.get("ts")),
    )
    db.add(fe)


# ============================================================
# Positions-Rebuild (aus DB)
# ============================================================


def _vwap_q(lst):
    q = sum(float(x.qty or 0.0) for x in lst)
    if q <= 0:
        return None, 0.0
    v = sum(float((x.price or 0.0)) * float((x.qty or 0.0)) for x in lst) / q
    return v, q

def _best_price(lst, side_first: str):
    prices = [float(x.price) for x in lst if getattr(x, "price", None) is not None]
    if not prices:
        return None
    return (min(prices) if side_first == "buy" else max(prices))


def rebuild_positions_orderlink(db: Session, *, bot_id: int) -> int:
    """
    'Fallback' als Hauptlogik:
    - Gruppiert Executions pro symbol nach exchange_order_id (Fallback: order_link_id).
    - Sortiert Gruppen chronologisch (first_ts).
    - Paart n mit erstem späteren m mit Gegenseite und ≈ gleicher Menge.
    - Berechnet VWAP/best, Fees, Funding (pnl_net = pnl_gross - fees_open - fees_close - funding_raw).
    - Markiert verwendete Executions als is_consumed=1.
    - Übrig gebliebene Gruppen werden als status='open' Position angelegt.
    """

    # 0/1/NULL is_consumed robust filtern
    q = (
        db.query(models.Execution)
          .filter(models.Execution.bot_id == bot_id)
          .filter(
              (models.Execution.is_consumed == False) |
              (models.Execution.is_consumed == 0) |
              (models.Execution.is_consumed.is_(None))
          )
          .order_by(models.Execution.symbol.asc(),
                    models.Execution.ts.asc(),
                    models.Execution.id.asc())
    )
    execs = q.all()
    if not execs:
        return 0

    # Pro Symbol sammeln
    by_symbol: dict[str, list[models.Execution]] = defaultdict(list)
    for e in execs:
        by_symbol[e.symbol].append(e)

    created = 0
    user_id_cache: dict[int, int] = {}

    def _user_id_for(bid: int) -> int | None:
        if bid in user_id_cache:
            return user_id_cache[bid]
        b = db.query(models.Bot).filter(models.Bot.id == bid).first()
        user_id_cache[bid] = b.user_id if b else None
        return user_id_cache[bid]

    for symbol, rows in by_symbol.items():
        # Gruppenbildung: key = exchange_order_id (preferiert), sonst order_link_id
        groups: dict[str, list[models.Execution]] = {}
        for r in rows:
            key = r.exchange_order_id or r.order_link_id or ""
            if not key:
                # Ohne Key: packen wir in einen eigenen "orphans"-Bucket je exec_id,
                # damit nichts verloren geht (jede Exec wird zu einer Mini-Gruppe).
                key = f"__orphans__#{r.id}"
            groups.setdefault(key, []).append(r)

        # Aggregation pro Gruppe
        agg: list[dict] = []
        for key, lst in groups.items():
            first_buy_ts  = min((x.ts for x in lst if (x.side or "").lower()=="buy"),  default=None)
            first_sell_ts = min((x.ts for x in lst if (x.side or "").lower()=="sell"), default=None)
            side = "buy" if first_buy_ts and (not first_sell_ts or first_buy_ts <= first_sell_ts) else "sell"

            vwap, qty = _vwap_q(lst)
            best = _best_price(lst, side)
            first_ts = min(x.ts for x in lst if x.ts) if lst else None
            last_ts  = max(x.ts for x in lst if x.ts) if lst else None
            fee_sum  = sum(float(x.fee_usdt or 0.0) for x in lst)

            agg.append({
                "key": key,
                "side": side,
                "qty": qty,
                "vwap": vwap,
                "best": best,
                "first_ts": first_ts,
                "last_ts": last_ts,
                "fee_sum": fee_sum,
                "rows": lst,  # für consume & Bestpreise
                "bot_id": lst[0].bot_id if lst else None,
            })

        # Chronologisch sortieren
        agg.sort(key=lambda g: (g["first_ts"] or datetime.now(timezone.utc)))

        i = 0
        eps = 1e-9
        used_row_ids: set[int] = set()

        while i < len(agg) - 1:
            g1 = agg[i]
            # Suche erstes späteres Gegenstück mit gegensätzlicher Seite und passender Menge
            j = i + 1
            pair = None
            while j < len(agg):
                g2 = agg[j]
                if g1["side"] != g2["side"] and abs((g1["qty"] or 0.0) - (g2["qty"] or 0.0)) <= eps:
                    pair = (g1, g2)
                    break
                j += 1

            if not pair:
                i += 1
                continue

            if (g1["first_ts"] or datetime.now(timezone.utc)) <= (g2["first_ts"] or datetime.now(timezone.utc)):
                entry_g, exit_g = g1, g2
            else:
                entry_g, exit_g = g2, g1
            side_first = entry_g["side"]

            v_entry = entry_g["vwap"]; v_exit = exit_g["vwap"]
            q_entry = entry_g["qty"];   q_exit = exit_g["qty"]
            if not (v_entry and v_exit and (q_entry or 0.0) > 0):
                i = j + 1
                continue

            fee_open  = entry_g["fee_sum"]
            fee_close = exit_g["fee_sum"]
            opened_at = entry_g["first_ts"]
            closed_at = exit_g["last_ts"]

            # Funding im Fenster (raw addieren; in pnl wird abgezogen)
            funding = sum(
                float(f.amount_usdt or 0.0)
                for f in db.query(models.FundingEvent)
                           .filter(models.FundingEvent.bot_id == entry_g["bot_id"])
                           .filter(models.FundingEvent.symbol == symbol)
                           .filter(models.FundingEvent.ts >= opened_at)
                           .filter(models.FundingEvent.ts <= closed_at)
            )

            # Fallback B: Executions ohne Link-IDs bei 00:00/08:00/16:00
            if funding == 0.0:
                fexec = (
                    db.query(models.Execution)
                    .filter(models.Execution.bot_id == entry_g["bot_id"])
                    .filter(models.Execution.symbol == symbol)
                    .filter(
                        ((models.Execution.order_link_id == None) | (models.Execution.order_link_id == "")) &
                        ((models.Execution.exchange_order_id == None) | (models.Execution.exchange_order_id == ""))
                    )
                    .filter(models.Execution.ts >= opened_at)
                    .filter(models.Execution.ts <= closed_at)
                    .all()
                )
                for x in fexec:
                    if x.ts and x.ts.strftime("%H:%M") in ("00:00","08:00","16:00"):
                        funding += float(x.fee_usdt or 0.0)



            # PnL (gross -> net); Funding: PnL - funding_raw (negatives funding -> PnL plus)
            if side_first == "buy":
                pnl_gross = (v_exit - v_entry) * q_entry
            else:
                pnl_gross = (v_entry - v_exit) * q_entry
            pnl_net = pnl_gross - abs(fee_open) - abs(fee_close) - funding

            # Bestpreise
            best_entry = _best_price(entry_g["rows"], side_first) or v_entry
            exit_side_for_best = "sell" if side_first == "buy" else "buy"
            best_exit  = _best_price(exit_g["rows"], exit_side_for_best) or v_exit

            bot_id_pos = entry_g["bot_id"]
            pos = models.Position(
                bot_id=bot_id_pos,
                user_id=_user_id_for(bot_id_pos),
                symbol=symbol,
                side=("long" if side_first == "buy" else "short"),
                status="closed",
                opened_at=opened_at,
                closed_at=closed_at,
                qty=q_entry,
                entry_price_vwap=v_entry,
                exit_price_vwap=v_exit,
                entry_price_best=best_entry,
                exit_price_best=best_exit,
                fee_open_usdt=abs(fee_open),
                fee_close_usdt=abs(fee_close),
                funding_usdt=funding,
                pnl_usdt=pnl_net,
                first_exec_at=opened_at,
                last_exec_at=closed_at,
            )

            es, xs, tl = _slippage_entry_exit_usdt(pos)
            pos.slippage_entry_usdt = es
            pos.slippage_exit_usdt = xs
            pos.slippage_timelag_usdt = tl

            db.add(pos); created += 1

            # Executions konsumieren
            for x in (entry_g["rows"] + exit_g["rows"]):
                used_row_ids.add(x.id)

            # Springe hinter das verwendete j
            i = j + 1


        # --- REST: Netting über nicht verwendete Rows + ggf. auto-close > 14d ---
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)

        remaining_rows = []
        for g in agg:
            for x in g["rows"]:
                if x.id not in used_row_ids:
                    remaining_rows.append(x)

        if remaining_rows:
            # chronologisch
            remaining_rows.sort(key=lambda r: (r.ts or datetime.now(timezone.utc), r.id or 0))

            net = 0.0
            entry_fills, exit_fills = [], []
            fee_open_r, fee_close_r = 0.0, 0.0
            first_side_r = None
            opened_at_r = None

            def _vwap_q_execs(fills):
                q = sum(float(getattr(e, "qty", 0.0) or 0.0) for e in fills)
                if q <= 0:
                    return None, 0.0
                v = sum(float((e.price or 0.0)) * float((e.qty or 0.0)) for e in fills) / q
                return v, q

            def _best_exec_price(fills, side):
                prices = [float(e.price) for e in fills if getattr(e, "price", None) is not None]
                if not prices:
                    return None
                return min(prices) if side == "buy" else max(prices)

            for e in remaining_rows:
                side = (e.side or "").lower()
                qty  = float(e.qty or 0.0)
                if qty == 0.0:
                    used_row_ids.add(e.id)
                    continue

                if net == 0.0:
                    first_side_r = side
                    opened_at_r  = e.ts
                net += qty if side == "buy" else -qty

                if side == first_side_r:
                    entry_fills.append(e);  fee_open_r  += float(e.fee_usdt or 0.0)
                else:
                    exit_fills.append(e);   fee_close_r += float(e.fee_usdt or 0.0)

                # geschlossen?
                if abs(net) <= 1e-12:
                    closed_at_r = e.ts
                    v_entry_r, q_entry_r = _vwap_q_execs(entry_fills)
                    v_exit_r,  q_exit_r  = _vwap_q_execs(exit_fills)
                    if v_entry_r is not None and v_exit_r is not None and q_entry_r > 0:
                        if first_side_r == "buy":
                            pnl_gross_r = (v_exit_r - v_entry_r) * q_entry_r
                            best_entry_r = _best_exec_price(entry_fills, "buy");  best_exit_r = _best_exec_price(exit_fills, "sell")
                        else:
                            pnl_gross_r = (v_entry_r - v_exit_r) * q_entry_r
                            best_entry_r = _best_exec_price(entry_fills, "sell"); best_exit_r = _best_exec_price(exit_fills, "buy")

                        # Funding im Fenster (raw addieren, später abziehen)
                        funding_raw_r = sum(
                            float(f.amount_usdt or 0.0)
                            for f in db.query(models.FundingEvent)
                                    .filter(models.FundingEvent.bot_id == e.bot_id)
                                    .filter(models.FundingEvent.symbol == symbol)
                                    .filter(models.FundingEvent.ts >= opened_at_r)
                                    .filter(models.FundingEvent.ts <= closed_at_r)
                        )
                        pnl_net_r = pnl_gross_r - abs(fee_open_r) - abs(fee_close_r) - funding_raw_r

                        pos = models.Position(
                            bot_id=e.bot_id,
                            user_id=_user_id_for(e.bot_id),
                            symbol=symbol,
                            side=("long" if first_side_r == "buy" else "short"),
                            status="closed",
                            opened_at=opened_at_r,
                            closed_at=closed_at_r,
                            qty=q_entry_r,
                            entry_price_vwap=v_entry_r,
                            exit_price_vwap=v_exit_r,
                            entry_price_best=best_entry_r or v_entry_r,
                            exit_price_best=best_exit_r  or v_exit_r,
                            fee_open_usdt=abs(fee_open_r),
                            fee_close_usdt=abs(fee_close_r),
                            funding_usdt=funding_raw_r,
                            pnl_usdt=pnl_net_r,
                            first_exec_at=opened_at_r,
                            last_exec_at=closed_at_r,
                        )

                        es, xs, tl = _slippage_entry_exit_usdt(pos)
                        pos.slippage_entry_usdt = es
                        pos.slippage_exit_usdt = xs
                        pos.slippage_timelag_usdt = tl
                        
                        db.add(pos); created += 1

                    # consume & reset
                    for z in (entry_fills + exit_fills):
                        used_row_ids.add(z.id)
                    entry_fills, exit_fills = [], []
                    fee_open_r = fee_close_r = 0.0
                    first_side_r = None
                    opened_at_r  = None

            # falls danach noch Netto-Exposure übrig ist → ggf. auto-close, wenn alt
            if abs(net) > 1e-12 and remaining_rows:
                last_ts   = remaining_rows[-1].ts
                if last_ts and (last_ts.replace(tzinfo=timezone.utc) if last_ts.tzinfo is None else last_ts) <= cutoff and entry_fills:
                    # synthetischer Close zum letzten Fill-Preis
                    last_price = float(remaining_rows[-1].price or 0.0)
                    v_entry_r, q_entry_r = _vwap_q_execs(entry_fills)
                    if v_entry_r and q_entry_r > 0 and last_price > 0:
                        if first_side_r == "buy":
                            pnl_gross_r = (last_price - v_entry_r) * q_entry_r
                            best_entry_r = _best_exec_price(entry_fills, "buy");  best_exit_r = last_price
                        else:
                            pnl_gross_r = (v_entry_r - last_price) * q_entry_r
                            best_entry_r = _best_exec_price(entry_fills, "sell"); best_exit_r = last_price

                        funding_raw_r = sum(
                            float(f.amount_usdt or 0.0)
                            for f in db.query(models.FundingEvent)
                                    .filter(models.FundingEvent.bot_id == entry_fills[0].bot_id)
                                    .filter(models.FundingEvent.symbol == symbol)
                                    .filter(models.FundingEvent.ts >= opened_at_r)
                                    .filter(models.FundingEvent.ts <= last_ts)
                        )

                        # (optional) Fallback-Exec-Funding auch hier:
                        if funding_raw_r == 0.0:
                            fexec2 = (
                                db.query(models.Execution)
                                .filter(models.Execution.bot_id == entry_fills[0].bot_id)
                                .filter(models.Execution.symbol == symbol)
                                .filter(
                                    ((models.Execution.order_link_id == None) | (models.Execution.order_link_id == "")) &
                                    ((models.Execution.exchange_order_id == None) | (models.Execution.exchange_order_id == ""))
                                )
                                .filter(models.Execution.ts >= opened_at_r)
                                .filter(models.Execution.ts <= last_ts)
                                .all()
                            )
                            for x in fexec2:
                                if x.ts and x.ts.strftime("%H:%M") in ("00:00","08:00","16:00"):
                                    funding_raw_r += float(x.fee_usdt or 0.0)

                        pnl_net_r = pnl_gross_r - abs(fee_open_r) - abs(fee_close_r) - funding_raw_r


                        pos = models.Position(
                            bot_id=entry_fills[0].bot_id,
                            user_id=_user_id_for(entry_fills[0].bot_id),
                            symbol=symbol,
                            side=("long" if first_side_r == "buy" else "short"),
                            status="closed",                               # auto-closed (alt)
                            opened_at=opened_at_r,
                            closed_at=last_ts,
                            qty=q_entry_r,
                            entry_price_vwap=v_entry_r,
                            exit_price_vwap=last_price,
                            entry_price_best=best_entry_r or v_entry_r,
                            exit_price_best=best_exit_r  or last_price,
                            fee_open_usdt=abs(fee_open_r),
                            fee_close_usdt=abs(fee_close_r),
                            funding_usdt=funding_raw_r,
                            pnl_usdt=pnl_net_r,
                            first_exec_at=opened_at_r,
                            last_exec_at=last_ts,
                        )

                        es, xs, tl = _slippage_entry_exit_usdt(pos)
                        pos.slippage_entry_usdt = es
                        pos.slippage_exit_usdt = xs
                        pos.slippage_timelag_usdt = tl

                        db.add(pos); created += 1

                    for z in entry_fills:
                        used_row_ids.add(z.id)

        # zum Schluss die verwendeten Execs wirklich konsumieren
        if used_row_ids:
            (db.query(models.Execution)
            .filter(models.Execution.id.in_(list(used_row_ids)))
            .update({"is_consumed": 1}, synchronize_session=False))
            db.flush()


        # Offen gebliebene Gruppen -> offene Position (status='open')
        # (alles, was noch nicht konsumiert wurde)
        # Wir konsumieren sie trotzdem, damit der Rebuilder idempotent bleibt.
        for g in agg:
            remaining = [x for x in g["rows"] if x.id not in used_row_ids]
            if not remaining:
                continue

            # schon offene Position vorhanden?
            exists = (
                db.query(models.Position.id)
                .filter(models.Position.bot_id == g["bot_id"])
                .filter(models.Position.symbol == symbol)
                .filter(models.Position.status == "open")
                .first()
            )
            if exists:
                continue

            side_first = (g["side"] or "buy").lower()

            # VWAP/Qty für die Entry-Seite der Rest-Gruppe
            entry_side_execs = [x for x in remaining if (x.side or "").lower() == side_first]
            v_open, q_open = _vwap_q(entry_side_execs if entry_side_execs else remaining)
            if not v_open or q_open <= 0:
                continue

            opened_at = min(x.ts for x in remaining if x.ts)
            last_ts   = max(x.ts for x in remaining if x.ts)
            best_open = _best_price(remaining, side_first)

            # Gebühren: nur Fees der Entry-Seite
            fee_open_group = sum(float(x.fee_usdt or 0.0) for x in entry_side_execs) if entry_side_execs \
                            else sum(float(x.fee_usdt or 0.0) for x in remaining)

            pos = models.Position(
                bot_id=g["bot_id"],
                user_id=_user_id_for(g["bot_id"]),
                symbol=symbol,
                side=("long" if side_first == "buy" else "short"),
                status="open",
                opened_at=opened_at,
                closed_at=None,
                qty=q_open,
                entry_price_vwap=v_open,
                exit_price_vwap=None,
                entry_price_best=best_open,
                exit_price_best=None,
                fee_open_usdt=abs(fee_open_group),
                fee_close_usdt=None,
                funding_usdt=0.0,    # kein Funding für offene Positionen
                pnl_usdt=None,
                first_exec_at=opened_at,
                last_exec_at=last_ts,
            )

            es, xs, tl = _slippage_entry_exit_usdt(pos)
            pos.slippage_entry_usdt = es
            pos.slippage_exit_usdt = xs
            pos.slippage_timelag_usdt = tl
            
            db.add(pos); created += 1

            # WICHTIG: remaining NICHT konsumieren (kein is_consumed=1),
            # damit sie beim späteren Closing sauber gematcht werden.

            db.flush()
            used_row_ids.clear()

    db.commit()
    return created


# --- Alternative builder ohne orderlink/exchange_id, rein zeitlich ---
def rebuild_positions(db: Session, *, bot_id: int) -> int:
    """
    Alternativer Rebuilder nur nach Symbol/TS (keine Order-IDs).
    Nutzt Netting + Fallback analog zur orderlink-Version.
    """
    q = (
        db.query(models.Execution)
        .filter(models.Execution.bot_id == bot_id)
        .filter(models.Execution.is_consumed == False)
        .order_by(models.Execution.symbol.asc(), models.Execution.ts.asc(), models.Execution.id.asc())
    )
    execs = q.all()
    if not execs:
        return 0

    grouped = defaultdict(list)
    for e in execs:
        grouped[e.symbol].append(e)

    created = 0
    for symbol, rows in grouped.items():
        rows.sort(key=lambda x: x.ts or datetime.now(timezone.utc))
        net = 0.0
        entry, exit = [], []
        fee_open, fee_close = 0.0, 0.0
        first_side = None
        opened_at, closed_at = None, None
        for e in rows:
            side = (e.side or "").lower()
            qty = float(e.qty or 0.0)
            if net == 0.0:
                first_side = side
                opened_at = e.ts
            net += qty if side == "buy" else -qty
            if side == first_side:
                entry.append(e)
                fee_open += float(e.fee_usdt or 0.0)
            else:
                exit.append(e)
                fee_close += float(e.fee_usdt or 0.0)
            if abs(net) <= 1e-8:
                closed_at = e.ts
                qsum = sum(float(x.qty or 0.0) for x in entry)
                if qsum > 0:
                    vwap_entry = sum(float(x.price or 0.0) * float(x.qty or 0.0) for x in entry) / qsum
                    vwap_exit = sum(float(x.price or 0.0) * float(x.qty or 0.0) for x in exit) / qsum
                    gross = (vwap_exit - vwap_entry) * qsum if first_side == "buy" else (vwap_entry - vwap_exit) * qsum
                    pnl_net = gross - abs(fee_open) - abs(fee_close)
                    pos = models.Position(
                        bot_id=bot_id,
                        user_id=db.query(models.Bot).filter(models.Bot.id == bot_id).first().user_id,
                        symbol=symbol,
                        side=("long" if first_side == "buy" else "short"),
                        status="closed",
                        opened_at=opened_at,
                        closed_at=closed_at,
                        qty=qsum,
                        entry_price_vwap=vwap_entry,
                        exit_price_vwap=vwap_exit,
                        pnl_usdt=pnl_net,
                        fee_open_usdt=abs(fee_open),
                        fee_close_usdt=abs(fee_close),
                        first_exec_at=opened_at,
                        last_exec_at=closed_at,
                    )


                    db.add(pos)
                    created += 1
                    used = entry + exit
                    db.query(models.Execution).filter(models.Execution.id.in_([x.id for x in used])).update({"is_consumed": True})
                    db.flush()
                net, entry, exit, fee_open, fee_close = 0, [], [], 0, 0

        # Fallback: offene Reste
        remaining = db.query(models.Execution).filter(
            models.Execution.bot_id == bot_id,
            models.Execution.symbol == symbol,
            models.Execution.is_consumed == False,
        ).all()
        if remaining:
            qty_sum = sum(float(r.qty or 0.0) for r in remaining)
            prices = [float(r.price or 0.0) for r in remaining if r.price]
            if prices:
                first_ts = min(r.ts for r in remaining if r.ts)
                last_ts = max(r.ts for r in remaining if r.ts)
                vwap_r = sum(float(r.price or 0.0) * float(r.qty or 0.0) for r in remaining) / abs(qty_sum)

                pos = models.Position(
                    bot_id=bot_id,
                    user_id=db.query(models.Bot).filter(models.Bot.id == bot_id).first().user_id,
                    symbol=symbol,
                    side=("long" if qty_sum > 0 else "short"),
                    status="closed",
                    opened_at=first_ts,
                    closed_at=last_ts,
                    qty=abs(qty_sum),
                    entry_price_vwap=vwap_r,
                    exit_price_vwap=vwap_r,
                    pnl_usdt=0.0,
                )
                db.add(pos)
                created += 1
                db.query(models.Execution).filter(models.Execution.id.in_([r.id for r in remaining])).update({"is_consumed": True})
                db.flush()

    db.commit()
    return created





# ============================================================
# Zeitfenster-Helper
# ============================================================

def _iter_windows(start_ms: int, end_ms: int, chunk_days: int = 7):
    cur = start_ms
    step = int(timedelta(days=chunk_days).total_seconds() * 1000)
    while cur < end_ms:
        nxt = min(cur + step, end_ms)
        yield cur, nxt
        cur = nxt


# ============================================================
# Sync: nur 1 Symbol, kleines Fenster (Entry/Exit = 2h)
# ============================================================

def sync_symbol_recent(
    db: Session,
    bot_id: int,
    symbol: str,
    hours: int = 2,
) -> Dict[str, Any]:
    """
    Für deinen Webhook-Flow: bei Entry oder Exit einfach 2h dieses Symbols ziehen.
    """
    bot = _get_bot(db, bot_id)
    if not bot:
        raise ValueError("Bot not found")

    api_key, api_secret = _get_keys(bot)
    client = BybitV5Data(api_key, api_secret)

    end_ms = _now_ms()
    start_ms = end_ms - int(timedelta(hours=max(1, hours)).total_seconds() * 1000)

    # Executions für genau dieses Symbol
    execs = _fetch_executions(client, symbol, start_ms, end_ms, max_pages=5)
    for r in execs:
        _persist_execution(
            db,
            bot.id,
            symbol,
            (r.get("side") or "").lower(),
            _f(r.get("execPrice")),
            _f(r.get("execQty")),
            _f(r.get("execFee")),
            str(r.get("isReduceOnly") or "").lower() in ("true", "1"),
            "maker" if str(r.get("isMaker")).lower() in ("true", "1") else "taker",
            _dt_ms(r.get("execTime")),
            r,
        )

    # Funding nur für dieses Symbol
    fund_rows = _fetch_funding_tx(client, start_ms, end_ms, max_pages=3)
    for ev in fund_rows:
        if (ev.get("symbol") or "").strip() == symbol:
            _persist_funding_event(db, bot.id, ev)

    # Positionen neu aufbauen
    recon = reconcile_symbol(db, bot.id, symbol)

    db.commit()
    return {
        "ok": True,
        "mode": "symbol_recent",
        "symbol": symbol,
        "hours": hours,
        "executions_persisted": len(execs),
        "positions_reconciled": recon,
    }


# ============================================================
# Sync: recent für EINEN Bot (z. B. alle 12/13h)
# ============================================================

def sync_recent_closures(
    db: Session,
    bot_id: int,
    lookback_hours: int = 12,
) -> Dict[str, Any]:
    bot = _get_bot(db, bot_id)
    if not bot:
        raise ValueError("Bot not found")

    api_key, api_secret = _get_keys(bot)
    client = BybitV5Data(api_key, api_secret)

    end_ms = _now_ms()
    if bot.last_sync_at:
        start_base = bot.last_sync_at - timedelta(hours=1)  # Sicherheitspuffer
        start_ms = int(start_base.timestamp() * 1000)
    else:
        start_ms = end_ms - int(timedelta(hours=max(1, lookback_hours)).total_seconds() * 1000)

    syms = _load_all_linear_usdt_symbols(client)

    total_execs = 0
    affected_syms: set[str] = set() 
    
    for sym in syms:
        lst = _fetch_executions(client, sym, start_ms, end_ms, max_pages=10)
        for r in lst:
            _persist_execution(
                db, bot.id, sym,
                (r.get("side") or "").lower(),
                _f(r.get("execPrice")),
                _f(r.get("execQty")),
                _f(r.get("execFee")),
                str(r.get("isReduceOnly") or "").lower() in ("true", "1"),
                "maker" if str(r.get("isMaker")).lower() in ("true", "1") else "taker",
                _dt_ms(r.get("execTime")),
                r,
            )
        if lst:
            affected_syms.add(sym)
            total_execs += len(lst)

    # Funding für das Fenster
    fund_rows = _fetch_funding_tx(client, start_ms, end_ms, max_pages=10)
    for ev in fund_rows:
        _persist_funding_event(db, bot.id, ev)

    # oder in recent_closures/backfill: set(syms) bzw. nur jene, für die execs kamen
    reconciled = {s: reconcile_symbol(db, bot.id, s) for s in affected_syms}

    bot.last_sync_at = datetime.now(timezone.utc)
    db.add(bot)
    db.commit()

    return {
        "ok": True,
        "mode": "recent",
        "lookback_hours": lookback_hours,
        "executions_persisted": total_execs,
        "funding_persisted": len(fund_rows),
        "positions_reconciled": reconciled,
    }


# ============================================================
# Sync: Backfill ab Zeitpunkt X (z. B. wenn Bot neu ist)
# ============================================================

def sync_backfill_since(
    db: Session,
    bot_id: int,
    since_ms: Optional[int] = None,
) -> Dict[str, Any]:
    bot = _get_bot(db, bot_id)
    if not bot:
        raise ValueError("Bot not found")

    api_key, api_secret = _get_keys(bot)
    client = BybitV5Data(api_key, api_secret)

    end_ms = _now_ms()

    # wenn since_ms nicht gesetzt: ab letztem lokalen Timestamp
    def _latest_ts(model_cls) -> Optional[int]:
        q = select(func.max(model_cls.ts)).where(model_cls.bot_id == bot.id)
        dt = db.execute(q).scalar()
        return int(dt.timestamp() * 1000) if dt else None

    since_exec = since_ms if since_ms is not None else (_latest_ts(models.Execution) or 0)
    since_fund = since_ms if since_ms is not None else (_latest_ts(models.FundingEvent) or 0)

    syms = _load_all_linear_usdt_symbols(client)

    inserted_execs = 0
    inserted_positions = 0
    persisted_fund = 0

    # 1) Executions in 7-Tage-Chunks
    for win_start, win_end in _iter_windows(since_exec, end_ms, chunk_days=7):
        exec_cache: List[Dict[str, Any]] = []
        for sym in syms:
            try:
                lst = _fetch_executions(client, sym, win_start, win_end, max_pages=20)
                for r in lst:
                    exec_cache.append({**r, "symbol": sym})
            except Exception:
                pass
        if exec_cache:
            for r in exec_cache:
                _persist_execution(
                    db,
                    bot.id,
                    r["symbol"],
                    (r.get("side") or "").lower(),
                    _f(r.get("execPrice")),
                    _f(r.get("execQty")),
                    _f(r.get("execFee")),
                    str(r.get("isReduceOnly") or "").lower() in ("true", "1"),
                    "maker" if str(r.get("isMaker")).lower() in ("true", "1") else "taker",
                    _dt_ms(r.get("execTime")),
                    r,
                )
            db.commit()
            inserted_execs += len(exec_cache)

    # 2) Funding in 7-Tage-Chunks
    for win_start, win_end in _iter_windows(since_fund, end_ms, chunk_days=7):
        try:
            fund_rows = _fetch_funding_tx(client, win_start, win_end, max_pages=20)
            for ev in fund_rows:
                _persist_funding_event(db, bot.id, ev)
            db.commit()
            persisted_fund += len(fund_rows)
        except Exception:
            pass

    # 3) Positionen neu erstellen:
    inserted_positions = rebuild_positions_orderlink(db, bot_id=bot.id)

    return {
        "ok": True,
        "mode": "backfill_since",
        "inserted_execs": inserted_execs,
        "inserted_positions": inserted_positions,
        "inserted_funding_events": persisted_fund,
        "symbols_scanned": len(syms),
        "window": {"since_ms": since_ms, "end_ms": end_ms},
    }

# ============================================================
# Voll-Historie (Convenience)
# ============================================================

def sync_full_history(
    db: Session,
    bot_id: int,
    days: int = 365,
) -> Dict[str, Any]:
    end_ms = _now_ms()
    start_ms = end_ms - int(timedelta(days=max(1, days)).total_seconds() * 1000)
    return sync_backfill_since(db, bot_id, since_ms=start_ms)


# ============================================================
# Quick-Debug: ein Symbol, ein paar Tage
# ============================================================

def quick_sync_symbol(
    db: Session,
    bot_id: int,
    symbol: str = "ETHUSDT",
    days: int = 5,
) -> Dict[str, Any]:
    bot = _get_bot(db, bot_id)
    if not bot:
        raise ValueError("Bot not found")
    api_key, api_secret = _get_keys(bot)
    client = BybitV5Data(api_key, api_secret)

    end_ms = _now_ms()
    start_ms = end_ms - int(timedelta(days=max(1, days)).total_seconds() * 1000)

    exec_rows = _fetch_executions(client, symbol, start_ms, end_ms, max_pages=10)
    for r in exec_rows:
        _persist_execution(
            db,
            bot.id,
            symbol,
            (r.get("side") or "").lower(),
            _f(r.get("execPrice")),
            _f(r.get("execQty")),
            _f(r.get("execFee")),
            str(r.get("isReduceOnly") or "").lower() in ("true", "1"),
            "maker" if str(r.get("isMaker")).lower() in ("true", "1") else "taker",
            _dt_ms(r.get("execTime")),
            r,
        )
    db.commit()

    fund_rows = _fetch_funding_tx(client, start_ms, end_ms, max_pages=10)
    for ev in fund_rows:
        _persist_funding_event(db, bot.id, ev)
    db.commit()

    affected_syms = set([symbol])  # quick_sync_symbol
    # oder in recent_closures/backfill: set(syms) bzw. nur jene, für die execs kamen
    reconciled = {s: reconcile_symbol(db, bot.id, s) for s in affected_syms}

    return {
        "ok": True,
        "mode": "quick_sync_symbol",
        "symbol": symbol,
        "inserted_execs": len(exec_rows),
        "inserted_funding_events": len(fund_rows),
        "positions_reconciled": reconciled,
        "window": {"start_ms": start_ms, "end_ms": end_ms},
    }


# ============================================================
# Worker-Variante: alle Bots über z. B. 13h
# ============================================================

def sync_recent_all_bots(
    db: Session,
    lookback_hours: int = 13,
) -> Dict[str, Any]:
    bots = db.query(models.Bot).filter(models.Bot.is_deleted == False).all()
    results: List[Dict[str, Any]] = []
    for b in bots:
        try:
            res = sync_recent_closures(db, b.id, lookback_hours=lookback_hours)
            results.append({"bot_id": b.id, "ok": True, "stats": res})
        except Exception as e:
            results.append({"bot_id": b.id, "ok": False, "error": str(e)})
    return {"ok": True, "bots": results}


