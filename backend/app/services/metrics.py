
# app/services/metrics.py
from __future__ import annotations
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta, timezone,  date
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from ..models import Position, Execution, FundingEvent
from app.services.portfolio_sync import compute_portfolio_value  # Portfoliowert je Zeitraum


# -------------------- kleine Helfer --------------------

def _safe_float(x) -> float:
    try:
        return float(x or 0.0)
    except Exception:
        return 0.0

def _pct(numer: float, denom: float) -> float:
    return (numer / denom) if denom else 0.0

def _safe(x) -> float:
    try:
        return float(x or 0.0)
    except Exception:
        return 0.0

def _ratio(n: float, d: float) -> Optional[float]:
    return (n / d * 100.0) if d else None

def _to_utc_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)



def _has_full_timelag(p: Position) -> bool:
    """
    Nur Trades mit kompletter Zeitkette (TV→Bot, Bot→Sent, Sent→Exchange) in Timelag-Analysen aufnehmen.
    """
    s = p.tv_signal  # Relationship -> TvSignal
    if not s:
        return False
    tv_ts = getattr(s, "tv_ts", None)
    bot_rcv = getattr(s, "bot_received_at", None)
    bot_sent = getattr(s, "bot_sent_at", None)
    exch_ts = getattr(p, "first_exec_at", None) or getattr(p, "opened_at", None)

    has_tv_bot   = bool(tv_ts and bot_rcv)
    has_proc     = bool(bot_rcv and bot_sent)
    has_bot_exch = bool(bot_sent and exch_ts)
    return has_tv_bot and has_proc and has_bot_exch


def get_timelags_ms(p: Position):
    s = p.tv_signal
    if not s:
        return None, None, None
    tv_ts   = _to_utc_aware(s.tv_ts)
    bot_rcv = _to_utc_aware(s.bot_received_at)
    bot_sent= _to_utc_aware(s.bot_sent)
    exch_ts = _to_utc_aware(p.first_exec_at or p.opened_at)

    tl_tv_bot   = (bot_rcv - tv_ts).total_seconds()*1000 if tv_ts and bot_rcv else None
    tl_bot_proc = (bot_sent - bot_rcv).total_seconds()*1000 if bot_sent and bot_rcv else None
    tl_bot_exch = (exch_ts - bot_sent).total_seconds()*1000 if exch_ts and bot_sent else None
    return tl_tv_bot, tl_bot_proc, tl_bot_exch


def _risk_effective(p: Position) -> Optional[float]:
    """
    Effektiver Risikobetrag (falls vorhanden). Sonst None.
    """
    for attr in ("risk_amount_effective_usdt", "risk_amount_usdt", "risk_initial_usdt"):
        val = getattr(p, attr, None)
        if val is not None:
            try:
                v = float(val)
                return v if v > 0 else None
            except Exception:
                pass
    return None

def _slippage_entry_exit_usdt(pos: Position) -> Tuple[float, float, float]:
    """
    Berechnet Entry-/Exit-Slippage in USDT (positiv = Kosten, negativ = Vorteil).
    - Entry: (entry_vwap - entry_best) * qty; für Shorts wird das Vorzeichen gedreht.
    - Exit : (exit_vwap  - exit_best)  * qty; für Shorts wird das Vorzeichen gedreht.
    - Timelag-Slippage (USDT) = theoretisches Ergebnis - tatsächliches Ergebnis - alle Kosten
    Gibt (entry_slip, exit_slip, total) zurück.
    """
    entry_slip = 0.0
    exit_slip  = 0.0

    qty = _safe(pos.qty)
    side = (pos.side or "").lower()

    # Entry-Slippage
    if pos.entry_price_vwap and pos.entry_price_best and qty:
        diff_entry = float(pos.entry_price_vwap) - float(pos.entry_price_best)
        if side == "long":
            # höherer VWAP als best = teurer Entry = Kosten (+)
            entry_slip = diff_entry * qty
        else:
            # Short: niedrigerer VWAP als best = schlechter Entry = Kosten (+)
            # => drehe Vorzeichen
            entry_slip = -diff_entry * qty

    # Exit-Slippage
    if pos.exit_price_vwap and pos.exit_price_best and qty:
        diff_exit = float(pos.exit_price_vwap) - float(pos.exit_price_best)
        if side == "long":
            # höherer Exit als best = schlechter Exit = Kosten (+)
            exit_slip = diff_exit * qty
        else:
            # Short: tieferer Exit als best = schlechter Exit = Kosten (+)
            exit_slip = -diff_exit * qty

    # --- Timelag-Slippage ---
    risk = getattr(pos, "risk_amount_usdt", 0) or 0
    rrr  = getattr(pos, "risk_reward", 0) or 0
    pnl  = getattr(pos, "pnl_usdt", 0) or 0
    fees = (getattr(pos, "fee_open_usdt", 0) or 0) + (getattr(pos, "fee_close_usdt", 0) or 0)
    funding = getattr(pos, "funding_usdt", 0) or 0

    if risk is None or rrr is None or risk == 0 or rrr == 0:
        slippage_timelag = None
    else:
        theoretical = risk * rrr if pnl > 0 else -risk
        slippage_timelag = theoretical - pnl - entry_slip - exit_slip - fees - funding

    return entry_slip, exit_slip, slippage_timelag


# -------------------- Aggregierte Summary (overall / today / mtd / d30) --------------------

def compute_summary(
        
    db: Session,
    *,
    tz: str = "Europe/Zurich",
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    tzinfo = ZoneInfo(tz)
    now = datetime.now(tzinfo)
    today = now.date()
    start_today = datetime(today.year, today.month, today.day, tzinfo=tzinfo)
    start_next_day = start_today + timedelta(days=1)

    start_mtd = datetime(today.year, today.month, 1, tzinfo=tzinfo)
    start_next_month = datetime(today.year + (1 if today.month == 12 else 0),
                                1 if today.month == 12 else today.month + 1,
                                1, tzinfo=tzinfo)
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

        entry_slip_total = 0.0
        exit_slip_total  = 0.0

        for p in plist:
            pnl = float(p.pnl_usdt or 0.0)
            realized += pnl
            total += 1
            if pnl > 0:
                wins += 1

            es, xs, _ts = _slippage_entry_exit_usdt(p)
            entry_slip_total += es
            exit_slip_total  += xs

        winrate = (wins / total) if total else 0.0

        # Fees aus Executions periodisch aggregiert (fallback: halbe-halbe, falls reduce_only fehlt)
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

        # (Platzhalter: Timelag/Processing falls du das noch ausbauen willst)
        slippage_liq_pct   = 0.0  # Prozent kannst du im Frontend relativ zum Risiko rechnen
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
            "fees_opening_total_usdt": opening_fees,
            "fees_closing_total_usdt": closing_fees,
            "funding_total_usdt": funding,
            # neue Summen:
            "entry_slippage_usdt_total": entry_slip_total,
            "exit_slippage_usdt_total": exit_slip_total,
            "slippage_net_total": entry_slip_total + exit_slip_total,
            # (Legacy-/Platzhalter-Keys beibehalten, falls dein Frontend sie nutzt)
            "fees_opening_closing_pct": 0.0,
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


# -------------------- Compute Stats (freier Zeitraum) --------------------

def compute_stats(db: Session, start: datetime, end: datetime) -> Dict[str, Any]:
    rows: List[Position] = db.query(Position).filter(
        Position.closed_at != None,
        Position.closed_at >= start,
        Position.closed_at < end,
    ).all()

    trades = len(rows)
    # p.pnl_usdt statt realized_pnl_net_usdt
    pnl = sum(_safe(getattr(p, "pnl_usdt", 0.0)) for p in rows)
    wins = sum(1 for p in rows if _safe(getattr(p, "pnl_usdt", 0.0)) > 0)
    win_rate = (wins / trades * 100.0) if trades else None

    # Fees aus Positionen (falls du lieber direkt die Executions aggregierst → wie oben in compute_summary)
    fees_abs = sum(
        _safe(getattr(p, "fee_open_usdt", 0.0)) +
        _safe(getattr(p, "fee_close_usdt", 0.0)) for p in rows
    )
    funding_abs = sum(_safe(getattr(p, "funding_usdt", 0.0)) for p in rows)

    # Slippage (Entry + Exit) positionsweise berechnet und aufsummiert
    slip_liq_abs = 0.0
    for p in rows:
        _, _, total_slip = _slippage_entry_exit_usdt(p)
        slip_liq_abs += total_slip

    # Falls du zusätzlich eine "timelag"-Slippage führst, hier 0.0 (oder aus Feld)
    slip_time_abs = sum(_safe(getattr(p, "slippage_timelag_usdt", 0.0)) for p in rows)

    # Prozent relativ zu Summe der Risiken (falls vorhanden)
    bot_rows = [p for p in rows if getattr(p, "risk_amount_usdt", None) is not None]
    denom = sum(_safe(getattr(p, "risk_amount_usdt", 0.0)) for p in bot_rows)

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
