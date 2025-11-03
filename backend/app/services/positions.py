from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app import models
from app.services.pnl import compute_pnl   # <- deine Funktion


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
    mark_consumed_for_position(db, pos.id)

    # 6) speichern
    return _finalize_position(
        db,
        pos,
        exit_price=exit_price_vwap,
        pnl_usdt=pnl_usdt,
        fee_close_usdt=fee_close_usdt,
        closed_at=exit_ts,
    )


def mark_consumed_for_position(db: Session, pos_id: int):
    pos = db.query(models.Position).filter(models.Position.id == pos_id).first()
    if not pos or not pos.opened_at or not pos.closed_at or not pos.qty:
        return

    entry_is_long = (str(pos.side or "long").lower() == "long")
    reduce_side = "sell" if entry_is_long else "buy"

    # Kandidaten: Exits im Zeitfenster der Position
    execs = (db.query(models.Execution)
               .filter(models.Execution.bot_id == pos.bot_id,
                       models.Execution.symbol == pos.symbol,
                       models.Execution.ts >= pos.opened_at,
                       models.Execution.ts <= pos.closed_at,
                       models.Execution.is_consumed == False)
               .order_by(models.Execution.ts.asc(), models.Execution.id.asc())
               .all())

    target = float(pos.qty or 0.0)
    used_ids = []
    taken = 0.0
    for e in execs:
        if (e.side or "").lower() != reduce_side and not bool(e.reduce_only):
            continue
        q = float(e.qty or 0.0)
        if q <= 0:
            continue
        take = min(q, target - taken)
        if take <= 0:
            break
        used_ids.append(e.id)
        taken += take
        if taken >= target - 1e-12:
            break

    if used_ids:
        (db.query(models.Execution)
           .filter(models.Execution.id.in_(used_ids))
           .update({"is_consumed": True}, synchronize_session=False))
        db.commit()
