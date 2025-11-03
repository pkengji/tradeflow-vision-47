# app/services/metrics.py
from __future__ import annotations
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, date
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo


from ..models import Position, Execution, FundingEvent
from app.services.portfolio_sync import compute_portfolio_value  # Portfoliowert je Zeitraum

def _safe_float(x) -> float:
    try:
        return float(x or 0.0)
    except Exception:
        return 0.0

def _pct(numer: float, denom: float) -> float:
    return (numer / denom) if denom else 0.0

def _has_full_timelag(p: Position) -> bool:
    """
    Ein Trade zählt NUR als timelag-fähig, wenn für Entry/Exit die Zeitkette vollständig ist.
    Passe die Feldnamen an deine Models an (Beispiele unten).
    """
    # Beispiele für Felder – bitte ggf. mapen:
    # p.tv_received_at, p.bot_sent_at, p.exchange_received_at, p.exchange_filled_at
    has_entry_chain = bool(getattr(p, "tv_received_at", None) and getattr(p, "bot_sent_at", None))
    has_exit_chain  = bool(getattr(p, "exchange_received_at", None) or getattr(p, "closed_at", None))
    # Du kannst die Logik feiner machen; wichtig ist: nur vollständige Trades fließen in Timelag ein
    return has_entry_chain and has_exit_chain

def _risk_effective(p: Position) -> Optional[float]:
    """
    Effektiver Risikobetrag, der 'gesendet' wurde (nach Bot-Overrides).
    Falls nicht vorhanden, None zurückgeben: der Trade wird aus prozentualen Slippage-Aggregaten ausgeschlossen.
    """
    # Passen diese Felder nicht, greife auf deine echten Felder zu:
    for attr in ("risk_amount_effective_usdt", "risk_amount_usdt", "risk_initial_usdt"):
        val = getattr(p, attr, None)
        if val is not None:
            try:
                v = float(val)
                return v if v > 0 else None
            except Exception:
                pass
    return None

def compute_summary(
    db: Session,
    *,
    tz: str = "Europe/Zurich",
    user_id: Optional[int] = None,  # notwendig für Portfolio je Zeitraum
) -> Dict[str, Any]:
    tzinfo = ZoneInfo(tz)
    now = datetime.now(tzinfo)
    today = now.date()
    start_today = datetime(today.year, today.month, today.day, tzinfo=tzinfo)
    start_next_day = start_today + timedelta(days=1)

    start_mtd = datetime(today.year, today.month, 1, tzinfo=tzinfo)
    # nächster Monat (exklusiv)
    if today.month == 12:
        start_next_month = datetime(today.year + 1, 1, 1, tzinfo=tzinfo)
    else:
        start_next_month = datetime(today.year, today.month + 1, 1, tzinfo=tzinfo)

    start_d30 = now - timedelta(days=30)

    # ---- Equity by day (nur geschlossene Positionen) + Open Count ----
    positions: List[Position] = db.query(Position).all()
    equity_by_day: Dict[date, float] = {}
    open_count = 0
    for p in positions:
        if (p.status or "") == "open":
            open_count += 1
        if (p.status or "") == "closed" and p.closed_at and p.pnl_usdt is not None:
            d = p.closed_at.astimezone(tzinfo).date()
            equity_by_day[d] = equity_by_day.get(d, 0.0) + float(p.pnl_usdt or 0.0)

    def _aggregate_period(start: Optional[datetime], end: Optional[datetime]) -> Dict[str, Any]:
        # Geschlossene Positionen im Zeitraum
        qpos = db.query(Position).filter(Position.status == "closed")
        if start: qpos = qpos.filter(Position.closed_at >= start)
        if end:   qpos = qpos.filter(Position.closed_at < end)
        plist = qpos.all()

        realized = 0.0
        wins = 0
        total = 0
        for p in plist:
            pnl = float(p.pnl_usdt or 0.0)
            realized += pnl
            total += 1
            if pnl > 0:
                wins += 1
        winrate = (wins / total) if total else 0.0

        # Fees aus Executions
        qexec = db.query(Execution)
        if start: qexec = qexec.filter(Execution.ts >= start)
        if end:   qexec = qexec.filter(Execution.ts < end)
        execs = qexec.all()

        opening_fees = 0.0
        closing_fees = 0.0
        if execs:
            has_reduce = any(bool(getattr(e, "reduce_only", False)) for e in execs)
            if has_reduce:
                for e in execs:
                    fee = float(e.fee_usdt or 0.0)
                    if bool(getattr(e, "reduce_only", False)):
                        closing_fees += fee
                    else:
                        opening_fees += fee
            else:
                total_fee = sum(float(e.fee_usdt or 0.0) for e in execs)
                opening_fees = total_fee * 0.5
                closing_fees = total_fee * 0.5

        # Funding
        qfund = db.query(FundingEvent)
        if start: qfund = qfund.filter(FundingEvent.ts >= start)
        if end:   qfund = qfund.filter(FundingEvent.ts < end)
        funding = sum(float(f.amount_usdt or 0.0) for f in qfund.all())

        # Platzhalter bis Schritt 5
        slippage_liq_pct   = 0.0
        slippage_time_pct  = 0.0
        timelag_entry_ms   = 0
        timelag_proc_ms    = 0
        timelag_exit_ms    = 0

        # Portfolio Value (nur wenn user_id vorhanden)
        portfolio_value = None
        if user_id is not None:
            res = compute_portfolio_value(
                db,
                user_id=user_id,
                date_from=start.isoformat() if start else None,
                date_to=end.isoformat() if end else None,
            )
            portfolio_value = float(res.get("portfolio_value", 0.0)) if isinstance(res, dict) else None

        return {
            "realized_pnl": realized,
            "winrate": winrate,
            "signals": total,
            "fees_opening_closing_pct": 0.0,  # Prozent kann dein Frontend berechnen, hier Summe liefern:
            "fees_opening_total_usdt": opening_fees,
            "fees_closing_total_usdt": closing_fees,
            "funding_total_usdt": funding,
            "slippage_liq_pct": slippage_liq_pct,
            "slippage_time_pct": slippage_time_pct,
            "timelag_entry_ms": timelag_entry_ms,
            "timelag_processing_ms": timelag_proc_ms,
            "timelag_exit_ms": timelag_exit_ms,
            "portfolio_value": portfolio_value,
        }

    # Zeiträume aggregieren
    overall = _aggregate_period(None, None)
    today_d = _aggregate_period(start_today, start_next_day)
    mtd_d   = _aggregate_period(start_mtd, start_next_month)
    d30_d   = _aggregate_period(start_d30, None)

    return {
        "open_count": open_count,
        "equity_by_day": {k.isoformat(): v for k, v in sorted(equity_by_day.items())},
        "overall": overall,
        "today": today_d,
        "mtd": mtd_d,
        "d30": d30_d,
    }




def _safe(x) -> float:
    try:
        return float(x or 0.0)
    except Exception:
        return 0.0

def _ratio(n: float, d: float) -> Optional[float]:
    return (n / d * 100.0) if d else None

def compute_stats(db: Session, start: datetime, end: datetime) -> Dict[str, Any]:
    rows: List[Position] = db.query(Position).filter(
        Position.closed_at != None,
        Position.closed_at >= start,
        Position.closed_at < end,
    ).all()

    trades = len(rows)
    pnl = sum(_safe(p.realized_pnl_net_usdt) for p in rows)
    wins = sum(1 for p in rows if _safe(p.realized_pnl_net_usdt) > 0)
    win_rate = (wins / trades * 100.0) if trades else None

    fees_abs = sum(_safe(p.fee_opening_usdt) + _safe(p.fee_closing_usdt) for p in rows)
    funding_abs = sum(_safe(p.funding_usdt) for p in rows)
    slip_liq_abs = sum(_safe(p.slippage_liquidity_usdt) for p in rows)
    slip_time_abs = sum(_safe(p.slippage_timelag_usdt) for p in rows)

    bot_rows = [p for p in rows if p.risk_amount_usdt is not None]
    denom = sum(_safe(p.risk_amount_usdt) for p in bot_rows)

    return {
        "ok": True,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "pnl_usdt": pnl,
        "trades": trades,
        "win_rate": win_rate,
        "tx_abs_usdt": {
            "fees": fees_abs,
            "funding": funding_abs,
            "slippage_liquidity": slip_liq_abs,
            "slippage_timelag": slip_time_abs
        },
        "tx_pct": {
            "fees": _ratio(fees_abs, denom),
            "funding": _ratio(funding_abs, denom),
            "slippage_liquidity": _ratio(slip_liq_abs, denom),
            "slippage_timelag": _ratio(slip_time_abs, denom)
        }
    }