# app/services/metrics.py
from __future__ import annotations
from typing import Dict, Any, Optional, Iterable, Tuple, List
from datetime import datetime, date
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo


from ..models import Position, Execution, FundingEvent

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

def compute_summary(db: Session, tz: str = "Europe/Zurich") -> Dict[str, Any]:
    tzinfo = ZoneInfo(tz)
    today = datetime.now(tzinfo).date()

    positions: list[Position] = db.query(Position).all()

    # --- Aggregationen Basis ---
    open_count = 0
    equity_by_day: Dict[date, float] = {}
    realized_today = 0.0
    realized_mtd   = 0.0
    realized_30d   = 0.0
    wins_today=0; tot_today=0
    wins_mtd=0;   tot_mtd=0
    wins_30d=0;   tot_30d=0

    # --- Slippage & Timelag Aggregation (in USDT, später in %) ---
    # Wir rechnen Slippage stets als Summe von "Liquidität" + "Timelag".
    # "Timelag" fließt NUR ein, wenn _has_full_timelag(p) == True.
    slippage_liq_usdt_total_filtered = 0.0
    slippage_time_usdt_total_filtered = 0.0
    denom_risk_total_filtered = 0.0  # Summe Risikobeträge der berücksichtigten Trades

    # Heute/MTD/30d für Fees-Split/Funding (optional kannst du es später je Periode differenzieren)
    opening_fees_usdt_total = 0.0
    closing_fees_usdt_total = 0.0
    funding_usdt_total      = 0.0

    # Iteriere über Positionen (geschlossene tragen zu realized bei)
    for p in positions:
        if p.status == "open":
            open_count += 1

        # Realized PnL / Winrate / Equity-by-day
        closed_at: Optional[datetime] = getattr(p, "closed_at", None)
        pnl_net: Optional[float] = getattr(p, "realized_pnl_net_usdt", None)
        if closed_at and pnl_net is not None:
            d = closed_at.astimezone(tzinfo).date()
            pnl = _safe_float(pnl_net)
            equity_by_day[d] = equity_by_day.get(d, 0.0) + pnl

            # buckets
            if d == today:
                tot_today += 1; realized_today += pnl
                if pnl > 0: wins_today += 1
            if d.year == today.year and d.month == today.month:
                tot_mtd += 1; realized_mtd += pnl
                if pnl > 0: wins_mtd += 1
            if (today - d).days <= 30:
                tot_30d += 1; realized_30d += pnl
                if pnl > 0: wins_30d += 1

        # --- Slippage- & Timelag-Einbindung ---
        # Effektiver Risikobetrag dieses Trades:
        risk_eff = _risk_effective(p)

        # Liquiditäts-Slippage (immer numerisch; wenn nicht vorhanden -> 0)
        slip_liq = _safe_float(getattr(p, "slippage_liquidity_usdt", None))

        # Timelag-Slippage NUR bei vollständigen Timestamps; sonst = 0 und NICHT in Durchschnitt einbeziehen
        if _has_full_timelag(p):
            slip_time = _safe_float(getattr(p, "slippage_timelag_usdt", None))
            # Denominator nur erhöhen, wenn wir *irgendeine* Slippage in % berechnen können
            if risk_eff is not None and (slip_liq or slip_time):
                denom_risk_total_filtered += risk_eff
            slippage_liq_usdt_total_filtered += slip_liq
            slippage_time_usdt_total_filtered += slip_time
        else:
            # Historische/Bybit-only: beides auf 0 halten, NICHT in denom aufnehmen
            # (genullt und aus der prozentualen Betrachtung ausgeschlossen)
            pass

    # --- Executions & Funding summieren (total) ---
    # Aufteilung Opening/Closing (falls reduce_only am Execution gesetzt; sonst heuristisch 50/50)
    execs: list[Execution] = db.query(Execution).all()
    has_reduce_flags = any(hasattr(e, "reduce_only") for e in execs)
    if has_reduce_flags:
        for e in execs:
            fee = _safe_float(e.fee_usdt)
            if getattr(e, "reduce_only", False):
                closing_fees_usdt_total += fee
            else:
                opening_fees_usdt_total += fee
    else:
        total_fee = sum(_safe_float(e.fee_usdt) for e in execs)
        opening_fees_usdt_total = total_fee * 0.5
        closing_fees_usdt_total = total_fee * 0.5

    fundings: list[FundingEvent] = db.query(FundingEvent).all()
    funding_usdt_total = sum(_safe_float(f.amount_usdt) for f in fundings)

    # --- prozentuale Slippage (gefiltert) ---
    # Wenn keine Trades mit vollständigen Timestamps vorliegen, bleiben die Prozentwerte = 0 (oder setze None, falls du im UI '—' willst).
    slippage_liq_pct_filtered  = _pct(slippage_liq_usdt_total_filtered, denom_risk_total_filtered)
    slippage_time_pct_filtered = _pct(slippage_time_usdt_total_filtered, denom_risk_total_filtered)

    # Gesamt-Slippage % = Summe der beiden Komponenten
    slippage_total_pct_filtered = slippage_liq_pct_filtered + slippage_time_pct_filtered

    # --- Fees % (gefiltert) ---
    # Für Prozentwerte der Fees brauchst du denselben Risikodenominator.
    fee_total_usdt_filtered = opening_fees_usdt_total + closing_fees_usdt_total
    fees_opening_pct_filtered = _pct(opening_fees_usdt_total, denom_risk_total_filtered)
    fees_closing_pct_filtered = _pct(closing_fees_usdt_total, denom_risk_total_filtered)
    funding_fee_pct_filtered  = _pct(funding_usdt_total,     denom_risk_total_filtered)
    fees_pct_filtered         = _pct(fee_total_usdt_filtered, denom_risk_total_filtered)
    fees_pct_filtered_total   = fees_pct_filtered + funding_fee_pct_filtered  # Fees + Funding

    # --- Heute/MTD/30d Prozentwerte: analog (vereinfachtes Placeholder – bei Bedarf pro Tag filtern) ---
    # Bis wir Tages-/MTD-weise risk_denominator bilden, setzen wir 0 – UI zeigt 0 % sauber an.
    fees_opening_pct_today = 0.0
    fees_closing_pct_today = 0.0
    funding_fee_pct_today  = 0.0
    fees_pct_today         = 0.0
    fees_pct_today_total   = 0.0
    slippage_liq_pct_today = 0.0
    slippage_time_pct_today= 0.0

    # MTD
    mtd = {
        "pnl": realized_mtd,
        "winrate": (wins_mtd / tot_mtd) if tot_mtd else 0.0,
        "fees_pct": 0.0,
        "fees_opening_pct": 0.0,
        "fees_closing_pct": 0.0,
        "funding_fee_pct": 0.0,
        "slippage_liq_pct": 0.0,
        "slippage_time_pct": 0.0,
        "fees_pct_total": 0.0,
        "timelag_tv_to_bot_ms": 0.0,
        "timelag_bot_to_ex_ms": 0.0,
    }

    # Last 30d
    last30d = {
        "pnl": realized_30d,
        "winrate": (wins_30d / tot_30d) if tot_30d else 0.0,
        "fees_pct": 0.0,
        "fees_opening_pct": 0.0,
        "fees_closing_pct": 0.0,
        "funding_fee_pct": 0.0,
        "slippage_liq_pct": 0.0,
        "slippage_time_pct": 0.0,
        "fees_pct_total": 0.0,
        "timelag_tv_to_bot_ms": 0.0,
        "timelag_bot_to_ex_ms": 0.0,
    }

    return {
        "portfolio_total": sum(equity_by_day.values()),
        "pnl_today": realized_today,
        "winrate_today": (wins_today / tot_today) if tot_today else 0.0,
        "open_trades_count": open_count,

        "pnl_filtered": realized_30d,  # Beispiel ‘filtered’ = 30 Tage
        "portfolio_filtered": sum(v for d, v in equity_by_day.items() if (today - d).days <= 30),
        "winrate_filtered": (wins_30d / tot_30d) if tot_30d else 0.0,

        # Transaktionskosten (% vom Risiko), gefiltert (über Trades mit vorhandenem Risiko & ggf. Timelag)
        "fees_pct_filtered": fees_pct_filtered,
        "fees_opening_pct_filtered": fees_opening_pct_filtered,
        "fees_closing_pct_filtered": fees_closing_pct_filtered,
        "funding_fee_pct_filtered": funding_fee_pct_filtered,
        "slippage_liq_pct_filtered": slippage_liq_pct_filtered,
        "slippage_time_pct_filtered": slippage_time_pct_filtered,
        "fees_pct_filtered_total": fees_pct_filtered_total,

        # Timelag (ms) – solange keine Kette vorhanden ist → 0
        "timelag_tv_to_bot_ms_filtered": 0.0,
        "timelag_bot_to_ex_ms_filtered": 0.0,

        # Heute (0 bis wir die Tages-Denominator ergänzen)
        "fees_pct_today": fees_pct_today,
        "fees_opening_pct_today": fees_opening_pct_today,
        "fees_closing_pct_today": fees_closing_pct_today,
        "funding_fee_pct_today": funding_fee_pct_today,
        "slippage_liq_pct_today": slippage_liq_pct_today,
        "slippage_time_pct_today": slippage_time_pct_today,
        "fees_pct_today_total": fees_pct_today_total,
        "timelag_tv_to_bot_ms_today": 0.0,
        "timelag_bot_to_ex_ms_today": 0.0,

        "mtd": mtd,
        "last30d": last30d,
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