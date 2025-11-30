from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from app import models
from app.services.pnl import compute_pnl   # <- deine Funktion
from app.services.metrics import _slippage_entry_exit_usdt, get_timelags_ms



def handle_position_open(
    db: Session,
    *,
    bot_id: int,
    symbol: str,
    side: str,              # "long" | "short"
    qty: float,
    opened_at: datetime | None = None,
) -> models.Position:
    side = (side or "long").lower()
    existing = (db.query(models.Position)
                  .filter_by(bot_id=bot_id, symbol=symbol, status="open")
                  .first())
    if existing:
        return existing

    now = datetime.now(timezone.utc)
    pos = models.Position(
        bot_id=bot_id,
        user_id=(db.query(models.Bot).get(bot_id).user_id if db.query(models.Bot).get(bot_id) else None),
        symbol=symbol,
        side=side,
        status="open",
        qty=qty,
        opened_at=opened_at or now,
        first_exec_at=opened_at or now,
        last_exec_at=opened_at or now,
        funding_usdt=0.0,            # bewusst 0 für offene
    )

    bss = (
        db.query(models.BotSymbolSetting)
          .filter(models.BotSymbolSetting.bot_id == bot_id)
          .filter(models.BotSymbolSetting.symbol == symbol)
          .first()
    )
    if bss and getattr(bss, "target_risk_amount", None) is not None:
        pos.risk_amount_usdt = float(bss.target_risk_amount or 0.0)

    es, _, _ = _slippage_entry_exit_usdt(pos)
    pos.slippage_entry_usdt = es
    
    db.add(pos); db.commit(); db.refresh(pos)

    # --- Orders mit gleicher trade_uid verknüpfen (falls vorhanden) ---
    if pos.trade_uid:
        orders = (
            db.query(models.Order)
              .filter(models.Order.bot_id == pos.bot_id)
              .filter(models.Order.symbol == pos.symbol)
              .filter(models.Order.order_link_id.contains(pos.trade_uid))
              .all()
        )
        for o in orders:
            if o.position_id is None:
                o.position_id = pos.id
                db.add(o)

    # direkt fee_open aktualisieren (Entry-Seite, unconsumed)
    update_fee_open_for_position(db, pos.id)
    return pos

def update_fee_open_for_position(db: Session, position_id: int) -> None:
    pos = db.query(models.Position).filter(models.Position.id == position_id).first()
    if not pos or not pos.opened_at:
        return
    entry_side = "buy" if (pos.side or "long").lower() == "long" else "sell"
    execs = (db.query(models.Execution)
               .filter(models.Execution.bot_id == pos.bot_id)
               .filter(models.Execution.symbol == pos.symbol)
               .filter(models.Execution.ts >= pos.opened_at)
               .filter((models.Execution.is_consumed == False) | (models.Execution.is_consumed.is_(None)))
               .all())
    fee_open = sum(float(e.fee_usdt or 0.0) for e in execs if (e.side or "").lower() == entry_side)
    pos.fee_open_usdt = float(fee_open or 0.0)
    # last_exec_at optimieren
    if execs:
        pos.last_exec_at = max((e.ts for e in execs if e.ts), default=pos.last_exec_at)
    db.add(pos); db.commit()


def _aggregate_exits_for_position(
    db: Session,
    position_id: int,
):
    """
    # CHANGED: Aggregiert Exit-Fills ohne Execution.position_id (das Feld existiert nicht).
    Strategie:
      - Position laden
      - Exekutionen derselben (bot_id, symbol) ab opened_at
      - Gewertet werden Fills, die die Position reduzieren:
          * reduce_only == True ODER
          * Gegenseite zur Entry-Seite
      - aufsummieren bis qty == pos.qty
    Gibt zurück: (vwap_exit, fee_close_usdt, closed_at)
    """
    pos: models.Position | None = db.query(models.Position).filter(models.Position.id == position_id).first()
    if not pos or not pos.opened_at:
        return None, 0.0, None

    # Welche Seite reduziert die Position?
    entry_is_long = (str(pos.side or "long").lower() == "long")
    reduce_side = "sell" if entry_is_long else "buy"

    execs = (
        db.query(models.Execution)
          .filter(models.Execution.bot_id == pos.bot_id)
          .filter(models.Execution.symbol == pos.symbol)
          .filter(models.Execution.ts >= pos.opened_at)
          .order_by(models.Execution.ts.asc(), models.Execution.id.asc())
          .all()
    )
    if not execs:
        return None, 0.0, None

    target_qty = float(pos.qty or 0.0)
    if target_qty <= 0:
        return None, 0.0, None

    notional = 0.0
    qty_sum = 0.0
    fee_sum = 0.0
    last_ts = None

    for e in execs:
        side = (e.side or "").lower()
        ro = bool(e.reduce_only)
        # Kandidat, wenn reduceOnly ODER Gegenseite
        if (ro or side == reduce_side):
            px = float(e.price or 0.0)
            q  = float(e.qty or 0.0)
            if q <= 0:
                continue
            take = min(q, target_qty - qty_sum)
            if take <= 0:
                break
            notional += px * take
            qty_sum += take
            fee_sum += float(e.fee_usdt or 0.0)
            last_ts = e.ts or last_ts

            if qty_sum >= target_qty - 1e-12:
                break

    if qty_sum <= 0:
        return None, 0.0, None

    vwap_exit = notional / qty_sum
    return vwap_exit, fee_sum, last_ts


def _finalize_position(
    db: Session,
    pos: models.Position,
    *,
    exit_price: float,
    pnl_usdt: float,
    fee_close_usdt: float,
    closed_at: datetime | None = None,
) -> models.Position:
    """
    Schreibt die finalen Werte in die Position.
    """
    pos.status = "closed"
    pos.exit_price_vwap = exit_price
    # für Frontend-Kompatibilität BEIDE Felder speichern:
    # ADDED: realized_pnl_net_usdt, falls dein Frontend darauf schaut
    if hasattr(pos, "realized_pnl_net_usdt"):
        pos.realized_pnl_net_usdt = pnl_usdt
    pos.pnl_usdt = pnl_usdt
    pos.fee_close_usdt = fee_close_usdt
    # --- Slippage ---
    es, xs, tl = _slippage_entry_exit_usdt(pos)
    pos.slippage_entry_usdt = es
    pos.slippage_exit_usdt  = xs
    pos.slippage_timelag_usdt = tl
    # --- Timelag (falls TV-Signal vorhanden) ---
    tl1, tl2, tl3 = get_timelags_ms(pos)
    pos.timelag_tv_bot_ms   = tl1
    pos.timelag_bot_proc_ms = tl2
    pos.timelag_bot_exch_ms = tl3

    if pos.trade_uid:
        orders = (
            db.query(models.Order)
            .filter(models.Order.bot_id == pos.bot_id)
            .filter(models.Order.symbol == pos.symbol)
            .filter(models.Order.order_link_id.contains(pos.trade_uid))

            .all()
        )
        for o in orders:
            o.position_id = pos.id


    pos.closed_at = closed_at or datetime.now(timezone.utc)

    # optional: generisches Feld, falls Frontend nur exit_price kennt
    if hasattr(pos, "exit_price"):
        pos.exit_price = exit_price

    db.add(pos)
    db.commit()
    db.refresh(pos)
    return pos


def handle_position_close(
    db: Session,
    position_id: int,
    *,
    exit_price_override: float | None = None,
) -> models.Position | None:
    """
    ZENTRALER CLOSE-HANDLER

    - holt Position
    - aggregiert Exits → VWAP + fee_close (ohne Execution.position_id)
    - bestimmt entry (trigger, vwap, fallback)
    - ruft compute_pnl(...)
    - schreibt Resultat in die DB
    """
    pos: models.Position | None = (
        db.query(models.Position)
          .filter(models.Position.id == position_id)
          .first()
    )
    if not pos:
        return None

    # 1) exit aus Executions ziehen
    exit_price_vwap, fee_close_usdt, exit_ts = _aggregate_exits_for_position(db, position_id)

    # wenn wir explizit einen Exitpreis bekommen haben → der hat Vorrang
    if exit_price_override is not None:
        exit_price_vwap = exit_price_override

    # 2) Entry bestimmen (deine bisherige Logik)
    entry_px = (
        getattr(pos, "entry_price_vwap", None)
        or getattr(pos, "entry_price_trigger", None)
        or getattr(pos, "entry_price", None)
        or 0.0
    )

    qty = float(pos.qty or 0.0)
    side = (pos.side or "long").lower()

    fee_open_usdt = float(getattr(pos, "fee_open_usdt", 0.0))
    fee_close_usdt = float(fee_close_usdt or 0.0)

    # 3) Exit-Fallback
    if exit_price_vwap is None:
        # letztes Sicherheitsnetz: mark_price
        exit_price_vwap = float(getattr(pos, "mark_price", 0.0))

    # 4) PnL berechnen
    pnl_usdt = compute_pnl(
        side=side,
        qty=qty,
        entry_price=entry_px,
        mark_price=exit_price_vwap,
        fees_open=fee_open_usdt,
        fees_close=fee_close_usdt,
    )
    # 5) Position als closed flaggen
    _consume_execs_for_position(db, pos.id)

    # 6) speichern
    return _finalize_position(
        db,
        pos,
        exit_price=exit_price_vwap,
        pnl_usdt=pnl_usdt,
        fee_close_usdt=fee_close_usdt,
        closed_at=exit_ts,
    )


# --- Reconcile Helpers (Live/Periodic) ---

def _aggregate_entries_for_open(db: Session, bot_id: int, symbol: str):
    rows = (db.query(models.Execution)
              .filter(models.Execution.bot_id == bot_id,
                      models.Execution.symbol == symbol,
                      models.Execution.is_consumed == False)
              .order_by(models.Execution.ts.asc(), models.Execution.id.asc())
              .all())
    if not rows:
        return None

    # erste Seite definiert die Entry-Seite
    first = next((r for r in rows if r.qty), None)
    if not first:
        return None
    side_first = (first.side or "").lower() or "buy"

    entry = [r for r in rows if (r.side or "").lower() == side_first]
    if not entry:
        return None

    q = sum(float(r.qty or 0.0) for r in entry)
    if q <= 0:
        return None

    v = sum(float(r.price or 0.0) * float(r.qty or 0.0) for r in entry) / q
    fee_open = sum(float(r.fee_usdt or 0.0) for r in entry)
    opened_at = min(r.ts for r in entry if r.ts)
    last_ts = max(r.ts for r in entry if r.ts)

    return {
        "side_first": side_first,  # 'buy'/'sell'
        "qty": q,
        "vwap": v,
        "best": (min if side_first == "buy" else max)(
            [float(r.price) for r in entry if r.price is not None]
        ),
        "fee_open": fee_open,
        "opened_at": opened_at,
        "last_ts": last_ts,
    }


def open_from_execs_if_missing(db: Session, bot_id: int, symbol: str):
    # bereits offene Position?
    exists = (db.query(models.Position.id)
                .filter(models.Position.bot_id == bot_id,
                        models.Position.symbol == symbol,
                        models.Position.status == "open")
                .first())
    if exists:
        return None

    agg = _aggregate_entries_for_open(db, bot_id, symbol)
    if not agg:
        return None

    side = "long" if agg["side_first"] == "buy" else "short"
    bot = db.query(models.Bot).filter(models.Bot.id == bot_id).first()
    pos = models.Position(
        bot_id=bot_id,
        user_id=(bot.user_id if bot else None),
        symbol=symbol,
        side=side,
        status="open",
        opened_at=agg["opened_at"],
        qty=agg["qty"],
        entry_price_vwap=agg["vwap"],
        entry_price_best=agg["best"],
        fee_open_usdt=abs(agg["fee_open"]),
        funding_usdt=0.0,
        first_exec_at=agg["opened_at"],
        last_exec_at=agg["last_ts"],
    )
    db.add(pos); db.commit(); db.refresh(pos)
    return pos


def _consume_execs_for_position(db: Session, pos: models.Position, *, both_sides: bool = True):
    """
    Markiert alle Executions für (bot_id, symbol) im Zeitfenster [opened_at, closed_at]
    als konsumiert. Damit können diese Fills nicht mehr für eine neue Position
    verwendet werden.
    """
    if not pos.opened_at:
        return

    q = (
        db.query(models.Execution)
        .filter(models.Execution.bot_id == pos.bot_id)
        .filter(models.Execution.symbol == pos.symbol)
        .filter(models.Execution.ts >= pos.opened_at)
    )

    if pos.closed_at:
        q = q.filter(models.Execution.ts <= pos.closed_at)

    exec_ids = [
        e.id
        for e in q.filter(
            (models.Execution.is_consumed == False) | (models.Execution.is_consumed.is_(None))
        ).all()
    ]

    if exec_ids:
        (
            db.query(models.Execution)
            .filter(models.Execution.id.in_(exec_ids))
            .update({"is_consumed": True}, synchronize_session=False)
        )
        db.commit()



def close_if_match(db: Session, bot_id: int, symbol: str):
    pos = (db.query(models.Position)
           .filter(models.Position.bot_id == bot_id,
                   models.Position.symbol == symbol,
                   models.Position.status == "open")
           .first())
    if not pos:
        return None

    # Exits aggregieren
    exit_vwap, fee_close, exit_ts = _aggregate_exits_for_position(db, pos.id)
    if exit_vwap is None or exit_ts is None:
        return None  # noch nicht genug/valide Exits

    fee_close = float(fee_close or 0.0)

    # Funding im Fenster [opened_at, exit_ts]
    funding_total = sum(
        float(f.amount_usdt or 0.0)
        for f in (db.query(models.FundingEvent)
                    .filter(models.FundingEvent.bot_id == pos.bot_id)
                    .filter(models.FundingEvent.symbol == pos.symbol)
                    .filter(models.FundingEvent.ts >= pos.opened_at)
                    .filter(models.FundingEvent.ts <= exit_ts))
    )

    pnl_usdt = compute_pnl(
        side=(pos.side or "long").lower(),
        qty=float(pos.qty or 0.0),
        entry_price=(pos.entry_price_vwap or pos.entry_price_trigger or 0.0),
        mark_price=exit_vwap,
        fees_open=float(pos.fee_open_usdt or 0.0),
        fees_close=fee_close,
    ) - funding_total

    pos = _finalize_position(
        db, pos,
        exit_price=exit_vwap,
        pnl_usdt=pnl_usdt,
        fee_close_usdt=fee_close,
        closed_at=exit_ts,
    )
    _consume_execs_for_position(db, pos, both_sides=True)
    return pos


def reconcile_symbol(db: Session, bot_id: int, symbol: str):
    # Reihenfolge: zuerst ggf. schließen, dann ggf. eine neue offene anlegen
    closed = close_if_match(db, bot_id, symbol)
    opened = open_from_execs_if_missing(db, bot_id, symbol)
    return {"closed": bool(closed), "opened": bool(opened)}

