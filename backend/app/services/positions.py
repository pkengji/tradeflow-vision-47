# app/services/positions.py
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app import models
from app.services.pnl import compute_pnl   # <- deine Funktion


def _aggregate_exits_for_position(db: Session, position_id: int):
    """
    Holt alle Executions zu dieser Position (close-seitig) und gibt:
    - vwap_exit
    - fee_close_usdt
    - closed_at
    zurück.
    Wenn nix gefunden wird → (None, 0.0, None)
    """
    execs = (
        db.query(models.Execution)
          .filter(models.Execution.position_id == position_id)
          # evtl. bei dir anders: 'Sell', 'Buy' oder 'sell', 'buy'
          .filter(models.Execution.side.in_(["Sell", "Buy"]))
          .order_by(models.Execution.ts.asc())
          .all()
    )

    if not execs:
        return None, 0.0, None

    notional = 0.0
    qty_sum = 0.0
    fee_sum = 0.0
    last_ts = None

    for e in execs:
        px = float(e.price or 0.0)
        qty = float(e.qty or 0.0)
        notional += px * qty
        qty_sum += qty
        fee_sum += float(e.fee_usdt or 0.0)
        last_ts = e.ts or last_ts

    vwap_exit = (notional / qty_sum) if qty_sum > 0 else None
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
    - aggregiert Exits → VWAP + fee_close
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

    # 5) speichern
    return _finalize_position(
        db,
        pos,
        exit_price=exit_price_vwap,
        pnl_usdt=pnl_usdt,
        fee_close_usdt=fee_close_usdt,
        closed_at=exit_ts,
    )
