from __future__ import annotations

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote

from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import Session

from .. import models
from ..bybit_v5_data import BybitV5Data


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

def rebuild_positions(
    db: Session,
    *,
    bot_id: int | None = None,
    user_id: int | None = None,
) -> int:
    """
    Sequentieller Positions-Builder.
    - nutzt nur echte Trade-Executions (order_link_id ODER exchange_order_id vorhanden)
    - ignoriert Funding/sonstige Events
    - baut Entry/Exit VWAP + Best-Preise
    - rechnet Funding aus funding_events
    - setzt SL/TP (TvSignal → Fallback Exit-Best)
    - markiert verwendete Executions als is_consumed=True
    """
    # --- Scope bestimmen ------------------------------------------------------
    q = db.query(models.Execution)
    if bot_id is not None:
        q = q.filter(models.Execution.bot_id == bot_id)
    elif user_id is not None:
        bot_ids = [
            b.id
            for b in db.query(models.Bot)
                      .filter(models.Bot.user_id == user_id, models.Bot.is_deleted == False)
                      .all()
        ]
        if not bot_ids:
            return 0
        q = q.filter(models.Execution.bot_id.in_(bot_ids))
    else:
        return 0  # nie alles rebuilden ohne scope

    # Nur unbenutzte Trades & keine Fundingexecs (→ Funding hat i. d. R. keine IDs)
    q = q.filter(models.Execution.is_consumed == False)
    q = q.filter(
        or_(
            and_(models.Execution.order_link_id.isnot(None), models.Execution.order_link_id != ""),
            and_(models.Execution.exchange_order_id.isnot(None), models.Execution.exchange_order_id != "")
        )
    )
    # (optional) exec_type-Filter weglassen, da wir über IDs schon Trades erzwingen

    execs: List[models.Execution] = q.order_by(
        models.Execution.symbol.asc(),
        models.Execution.ts.asc(),
        models.Execution.id.asc(),
    ).all()
    if not execs:
        return 0

    # pro Symbol sequenziell
    by_symbol: Dict[str, List[models.Execution]] = {}
    for e in execs:
        by_symbol.setdefault(e.symbol, []).append(e)

    # Cache Bot→User
    bot_user_cache: dict[int, Optional[int]] = {}

    created = 0

    for symbol, rows in by_symbol.items():
        net = 0.0
        entry_fills: List[Dict[str, Any]] = []
        exit_fills:  List[Dict[str, Any]] = []
        fee_open = 0.0
        fee_close = 0.0
        opened_at: Optional[datetime] = None
        closed_at: Optional[datetime] = None
        first_side: Optional[str] = None
        bot_id_for_pos = rows[0].bot_id

        if bot_id_for_pos not in bot_user_cache:
            bobj = db.query(models.Bot).filter(models.Bot.id == bot_id_for_pos).first()
            bot_user_cache[bot_id_for_pos] = bobj.user_id if bobj else None
        user_id_for_pos = bot_user_cache.get(bot_id_for_pos)

        for r in rows:
            qty = float(r.qty or 0.0)
            if qty == 0.0:
                continue
            side = (r.side or "").lower()

            # neue Position beginnt?
            if net == 0.0:
                first_side = "buy" if side == "buy" else "sell"
                opened_at = r.ts

            # Netto-Menge fortschreiben
            net += qty if side == "buy" else -qty

            # Fill aufnehmen + Fees
            fill_rec = {
                "price": float(r.price or 0.0),
                "qty": qty,
                "ts": r.ts,
                "order_link_id": (r.order_link_id or "").strip(),
                "exchange_order_id": (r.exchange_order_id or "").strip(),
                "_row_id": r.id,
            }
            if first_side == "buy":
                if side == "buy":
                    entry_fills.append(fill_rec)
                    fee_open += float(r.fee_usdt or 0.0)
                else:
                    exit_fills.append(fill_rec)
                    fee_close += float(r.fee_usdt or 0.0)
            else:
                if side == "sell":
                    entry_fills.append(fill_rec)
                    fee_open += float(r.fee_usdt or 0.0)
                else:
                    exit_fills.append(fill_rec)
                    fee_close += float(r.fee_usdt or 0.0)

            # Position geschlossen?
            if abs(net) <= max(1e-10, 1e-8 * max(abs(net), 1.0)):
                closed_at = r.ts

                # VWAP helper
                def _vwap(fills: List[Dict[str, Any]]) -> tuple[Optional[float], float]:
                    qsum = sum(f["qty"] for f in fills)
                    if qsum <= 0:
                        return None, 0.0
                    v = sum(f["price"] * f["qty"] for f in fills) / qsum
                    return v, qsum

                entry_v, qty_open = _vwap(entry_fills)
                exit_v,  qty_close = _vwap(exit_fills)

                # Funding im Zeitraum
                funding_rows = (
                    db.query(models.FundingEvent)
                      .filter(models.FundingEvent.bot_id == bot_id_for_pos,
                              models.FundingEvent.symbol == symbol,
                              models.FundingEvent.ts >= opened_at,
                              models.FundingEvent.ts <= closed_at)
                      .all()
                )
                funding_total = sum(float(fr.amount_usdt or 0.0) for fr in funding_rows)

                # Brutto-PnL
                gross = 0.0
                if entry_v is not None and exit_v is not None and qty_open > 0:
                    if first_side == "buy":
                        gross = (exit_v - entry_v) * qty_open
                    else:
                        gross = (entry_v - exit_v) * qty_open

                net_pnl = gross - abs(fee_open) - abs(fee_close) + funding_total

                # trade_uid aus Entry-Fills (order_link_id → Fallback exchange_order_id)
                trade_uid: Optional[str] = None
                for f in entry_fills:
                    olid = f.get("order_link_id")
                    exid = f.get("exchange_order_id")
                    trade_uid = _uid_from_any(olid, exid)
                    if trade_uid:
                        break

                # referenzen (TvSignal/Outbox)
                tv_signal_id = None
                outbox_item_id = None
                if trade_uid:
                    tv = db.query(models.TvSignal).filter(models.TvSignal.trade_uid == trade_uid).first()
                    if tv:
                        tv_signal_id = tv.id
                    ob = db.query(models.OutboxItem).filter(models.OutboxItem.trade_uid == trade_uid).first()
                    if ob:
                        outbox_item_id = ob.id

                # --- Best-Preise (immer berechnen!) ------------------------------
                entry_prices = [float(f["price"]) for f in entry_fills if f.get("price") is not None]
                exit_prices  = [float(f["price"]) for f in exit_fills  if f.get("price") is not None]

                entry_best = None
                if entry_prices:
                    entry_best = min(entry_prices) if first_side == "buy" else max(entry_prices)

                exit_best = None
                if exit_prices:
                    # Exit: Gegenseite zum Entry
                    exit_best = (max(exit_prices) if first_side == "buy" else min(exit_prices))
                # -----------------------------------------------------------------

                # --- SL/TP: TvSignal → Fallback Exit-Best -----------------------
                sl_price = None
                tp_price = None
                if tv_signal_id:
                    tv_sig = db.get(models.TvSignal, tv_signal_id)
                    if tv_sig:
                        sl_price = float(tv_sig.stop_loss_tv)   if tv_sig.stop_loss_tv   is not None else None
                        tp_price = float(tv_sig.take_profit_tv) if tv_sig.take_profit_tv is not None else None

                if not sl_price and not tp_price:
                    if net_pnl is not None and net_pnl >= 0:
                        tp_price = exit_best
                    else:
                        sl_price = exit_best
                # -----------------------------------------------------------------

                pos = models.Position(
                    bot_id=bot_id_for_pos,
                    user_id=user_id_for_pos,
                    symbol=symbol,
                    side=("long" if first_side == "buy" else "short"),
                    status="closed",
                    opened_at=opened_at,
                    closed_at=closed_at,
                    qty=qty_open,
                    entry_price_vwap=entry_v,
                    exit_price_vwap=exit_v,
                    entry_price_best=entry_best,
                    exit_price_best=exit_best,
                    sl_price=sl_price,
                    tp_price=tp_price,
                    fee_open_usdt=abs(fee_open),
                    fee_close_usdt=abs(fee_close),
                    funding_usdt=funding_total,
                    pnl_usdt=net_pnl,
                    unrealized_pnl_usdt=None,
                    trade_uid=trade_uid,
                    tv_signal_id=tv_signal_id,
                    outbox_item_id=outbox_item_id,
                    first_exec_at=opened_at,
                    last_exec_at=closed_at,
                )
                db.add(pos)
                created += 1

                # Executions markieren
                used_ids = [f["_row_id"] for f in (entry_fills + exit_fills) if f.get("_row_id")]
                if used_ids:
                    (db.query(models.Execution)
                       .filter(models.Execution.id.in_(used_ids))
                       .update({"is_consumed": True}, synchronize_session=False))
                    db.flush()

                # Reset
                net = 0.0
                entry_fills.clear()
                exit_fills.clear()
                fee_open = fee_close = 0.0
                opened_at = closed_at = None
                first_side = None

    db.commit()
    return created

def rebuild_positions_orderlink(db: Session, *, bot_id: int) -> int:
    """
    Baut Positionen anhand von order_link_id-Gruppen (keine Teil-Exits).
    - Aggregiert pro order_link_id die Fills (VWAP, Best, Fees, Qty)
    - Paart Entry-Gruppe mit nächster Gegenseite gleicher Menge
    - Funding aus funding_events, Fallback executions 00:00/08:00/16:00
    - SL/TP primär aus TvSignal (trade_uid aus order_link_id), sonst Fallback aus Exit-Best
    - Schreibt entry/exit_best, exit_price_vwap, sl_price, tp_price in Position
    - Markiert verwendete Executions als is_consumed=True
    """
    q = (
        db.query(models.Execution)
          .filter(models.Execution.bot_id == bot_id)
          .filter(models.Execution.is_consumed == False)
          .filter(models.Execution.exchange_order_id.isnot(None))
          .filter(models.Execution.exchange_order_id != "")
    )
    if hasattr(models.Execution, "exec_type"):
        q = q.filter(models.Execution.exec_type.in_([None, "", "Trade"]))

    rows = q.order_by(
        models.Execution.symbol.asc(),
        models.Execution.ts.asc(),
        models.Execution.id.asc()
    ).all()
    if not rows:
        return 0

    from collections import defaultdict
    sym_groups = defaultdict(list)
    for r in rows:
        sym_groups[r.symbol].append(r)

    created = 0

    # user_id des Bots einmalig auflösen (spar SQL)
    bot_row = db.query(models.Bot).filter(models.Bot.id == bot_id).first()
    user_id_for_pos = bot_row.user_id if bot_row else None

    for symbol, sym_rows in sym_groups.items():
        # map: order_link_id -> list[Execution]
        groups = {}
        for r in sym_rows:
            groups.setdefault(r.exchange_order_id, []).append(r)

        # make aggregates per order_link_id
        grouped = []
        for olid, lst in groups.items():
            buys = sum(1 for x in lst if (x.side or "").lower() == "buy")
            sells = sum(1 for x in lst if (x.side or "").lower() == "sell")
            side = "buy" if buys >= sells else "sell"

            qty_sum = sum(float(x.qty or 0.0) for x in lst)
            vwap = (sum(float(x.price or 0.0) * float(x.qty or 0.0) for x in lst) / qty_sum) if qty_sum else None
            prices = [float(x.price or 0.0) for x in lst if x.price is not None]
            best = (min(prices) if side == "buy" else max(prices)) if prices else None
            first_ts = min(x.ts for x in lst if x.ts)
            last_ts  = max(x.ts for x in lst if x.ts)
            fee_sum  = sum(float(x.fee_usdt or 0.0) for x in lst)
            row_ids  = [x.id for x in lst]

            grouped.append({
                "olid": olid,
                "side": side,             # "buy" oder "sell"
                "qty": qty_sum,
                "vwap": vwap,
                "best": best,
                "first_ts": first_ts,
                "last_ts": last_ts,
                "fee_sum": fee_sum,
                "row_ids": row_ids,
            })

        grouped.sort(key=lambda g: (g["first_ts"] or g["last_ts"]))
        i = 0
        eps = 1e-9

        while i < len(grouped) - 1:
            g1 = grouped[i]
            # passendes Gegenstück suchen: nächstes entgegengesetztes mit gleicher Menge
            j = i + 1
            pair = None
            while j < len(grouped):
                g2 = grouped[j]
                if g1["side"] != g2["side"] and abs(g1["qty"] - g2["qty"]) <= eps:
                    pair = (g1, g2)
                    break
                j += 1

            if not pair:
                i += 1
                continue

            # Entry ist die BUY-Gruppe, Exit die SELL-Gruppe (unabhängig von Reihenfolge im Stream)
            entry_g, exit_g = pair if g1["side"] == "buy" else (pair[1], pair[0])
            first_side = "buy" if g1["side"] == "buy" else "sell"

            opened_at = entry_g["first_ts"]
            closed_at = exit_g["last_ts"]

            # Funding summieren (Events → Fallback Executions)
            funding_total = 0.0
            fe_rows = (
                db.query(models.FundingEvent)
                  .filter(models.FundingEvent.bot_id == bot_id,
                          models.FundingEvent.symbol == symbol,
                          models.FundingEvent.ts >= opened_at,
                          models.FundingEvent.ts <= closed_at)
                  .all()
            )
            if fe_rows:
                funding_total = sum(float(fr.amount_usdt or 0.0) for fr in fe_rows)
            else:
                fexec = (
                    db.query(models.Execution)
                      .filter(models.Execution.bot_id == bot_id,
                              models.Execution.symbol == symbol)
                      .filter((models.Execution.exchange_order_id == None) | (models.Execution.exchange_order_id == ""))
                      .filter(models.Execution.ts >= opened_at,
                              models.Execution.ts <= closed_at)
                      .all()
                )
                for x in fexec:
                    hhmm = (x.ts or opened_at).strftime("%H:%M")
                    if hhmm in ("00:00", "08:00", "16:00"):
                        funding_total += float(x.fee_usdt or 0.0)

            # PnL (gross/net)
            qty = entry_g["qty"]
            pnl_gross = 0.0
            if entry_g["vwap"] is not None and exit_g["vwap"] is not None and qty > 0:
                if first_side == "buy":
                    pnl_gross = (exit_g["vwap"] - entry_g["vwap"]) * qty
                else:
                    pnl_gross = (entry_g["vwap"] - exit_g["vwap"]) * qty

            fee_open = entry_g["fee_sum"]
            fee_close = exit_g["fee_sum"]
            pnl_net = pnl_gross - abs(fee_open) - abs(fee_close) + funding_total

            # --- Best-Preise für Entry/Exit --------------------------------------
            # Entry: bei Buy min→best, bei Sell max→best (wie oben aggregiert)
            entry_best = entry_g["best"]
            # Exit: analog — best am Exit (die Aggregationsregel bleibt wie oben)
            exit_best = exit_g["best"]
            # ---------------------------------------------------------------------

            # --- SL/TP aus TradingView (TvSignal) oder Fallback ------------------
            trade_uid = _uid_from_any(entry_g["olid"])  # deine bestehende Logik
            sl_price = None
            tp_price = None

            tv_sig = (
                db.query(models.TvSignal)
                  .filter(models.TvSignal.bot_id == bot_id,
                          models.TvSignal.trade_uid == trade_uid)
                  .first()
            )
            if tv_sig:
                sl_price = float(tv_sig.stop_loss_tv) if tv_sig.stop_loss_tv else None
                tp_price = float(tv_sig.take_profit_tv) if tv_sig.take_profit_tv else None

            if not sl_price and not tp_price:
                # plausibler Fallback: Exit-Best als TP/SL je nach Ergebnis
                if pnl_net is not None and pnl_net >= 0:
                    tp_price = exit_best
                else:
                    sl_price = exit_best
            # ---------------------------------------------------------------------

            pos = models.Position(
                bot_id=bot_id,
                user_id=user_id_for_pos,
                symbol=symbol,
                side=("long" if first_side == "buy" else "short"),
                status="closed",
                opened_at=opened_at,
                closed_at=closed_at,
                qty=qty,
                entry_price_vwap=entry_g["vwap"],
                exit_price_vwap=exit_g["vwap"],   # wichtig: VWAP am Exit
                entry_price_best=entry_best,       # NEU
                exit_price_best=exit_best,         # NEU
                sl_price=sl_price,                 # NEU
                tp_price=tp_price,                 # NEU
                fee_open_usdt=abs(fee_open),
                fee_close_usdt=abs(fee_close),
                funding_usdt=funding_total,
                pnl_usdt=pnl_net,
                first_exec_at=opened_at,
                last_exec_at=closed_at,
                trade_uid=trade_uid,
                tv_signal_id=(tv_sig.id if tv_sig else None),
            )
            db.add(pos)
            created += 1

            # verwendete Executions als konsumiert markieren
            used_ids = entry_g["row_ids"] + exit_g["row_ids"]
            if used_ids:
                (db.query(models.Execution)
                   .filter(models.Execution.id.in_(used_ids))
                   .update({"is_consumed": True}, synchronize_session=False))
            db.flush()

            i = j + 1

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
    rebuilt = rebuild_positions(db, bot_id=bot.id)

    db.commit()
    return {
        "ok": True,
        "mode": "symbol_recent",
        "symbol": symbol,
        "hours": hours,
        "executions_persisted": len(execs),
        "positions_rebuilt": rebuilt,
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
    start_ms = end_ms - int(timedelta(hours=max(1, lookback_hours)).total_seconds() * 1000)

    syms = _load_all_linear_usdt_symbols(client)

    total_execs = 0
    for sym in syms:
        lst = _fetch_executions(client, sym, start_ms, end_ms, max_pages=10)
        for r in lst:
            _persist_execution(
                db,
                bot.id,
                sym,
                (r.get("side") or "").lower(),
                _f(r.get("execPrice")),
                _f(r.get("execQty")),
                _f(r.get("execFee")),
                str(r.get("isReduceOnly") or "").lower() in ("true", "1"),
                "maker" if str(r.get("isMaker")).lower() in ("true", "1") else "taker",
                _dt_ms(r.get("execTime")),
                r,
            )
        total_execs += len(lst)

    # Funding für das Fenster
    fund_rows = _fetch_funding_tx(client, start_ms, end_ms, max_pages=10)
    for ev in fund_rows:
        _persist_funding_event(db, bot.id, ev)

    # Rebuild
    rebuilt = rebuild_positions(db, bot_id=bot.id)
    db.commit()

    return {
        "ok": True,
        "mode": "recent",
        "lookback_hours": lookback_hours,
        "executions_persisted": total_execs,
        "funding_persisted": len(fund_rows),
        "positions_rebuilt": rebuilt,
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
            inserted_positions += rebuild_positions(db, bot_id=bot.id)

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

    rebuilt = rebuild_positions(db, bot_id=bot.id)

    return {
        "ok": True,
        "mode": "quick_sync_symbol",
        "symbol": symbol,
        "inserted_execs": len(exec_rows),
        "inserted_funding_events": len(fund_rows),
        "positions_rebuilt": rebuilt,
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
