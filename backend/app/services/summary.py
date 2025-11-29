# app/services/summary.py
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional, Tuple, Dict, Any, List

from sqlalchemy.orm import Session
from app import models

# ----------------------------
# Zeit & Hilfs-Typen
# ----------------------------

HourRange = Optional[Tuple[Tuple[int, int], Tuple[int, int]]]  # ((h1,m1), (h2,m2))


def _to_utc_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def start_of_day_utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)

def start_of_month_utc(d: date) -> datetime:
    return datetime(d.year, d.month, 1, tzinfo=timezone.utc)

def days_ago_utc(n: int) -> datetime:
    return utc_now() - timedelta(days=n)

def safe_rate(wins: int, total: int) -> float:
    return (wins / total) if total > 0 else 0.0

def time_in_range(dt: Optional[datetime], rng: HourRange) -> bool:
    """
    Prüft, ob eine Zeit (UTC) innerhalb eines Tageszeit-Fensters liegt.
    Unterstützt Fenster über Mitternacht (z.B. 22:00–03:00).
    """
    if not rng or not dt:
        return True
    dt = _to_utc_aware(dt)
    (ah, am), (bh, bm) = rng
    t = (dt.hour, dt.minute)
    tmin = (ah, am); tmax = (bh, bm)
    if tmin <= tmax:
        return (t >= tmin) and (t <= tmax)
    else:
        return (t >= tmin) or (t <= tmax)

def _dir_ok(p: models.Position, direction: Optional[str]) -> bool:
    if not direction or direction.lower() == "both":
        return True
    d = direction.lower()
    if d in ("long", "short"):
        return (p.side or "").lower() == d
    return True

# ----------------------------
# USDT-Summen & Timelag-KPIs
# ----------------------------

def _sum_usdt_tx(positions: Iterable[models.Position]) -> Dict[str, float]:
    fees = 0.0
    funding = 0.0
    slip_liq = 0.0
    slip_time = 0.0
    for p in positions:
        fees += float(p.fee_open_usdt or 0.0) + float(p.fee_close_usdt or 0.0)
        funding += float(p.funding_usdt or 0.0)
        slip_liq += float(p.slippage_entry_usdt or 0.0) + float(p.slippage_exit_usdt or 0.0)
        slip_time += float(p.slippage_timelag_usdt or 0.0)

    total_cost = fees + funding + slip_liq + slip_time

    return {
        "fees": fees,
        "funding": funding,
        "slip_liquidity": slip_liq,
        "slip_time": slip_time,
        "total": total_cost,
    }

def _tx_breakdown_pct(positions: Iterable[models.Position]) -> Dict[str, float]:
    """
    Break-Down der Transaktionskosten in % des gesamten risk_amount_usdt.
    Gewichtung über Risk-Summe: Sum(component) / Sum(risk_amount_usdt) * 100.
    """
    total_risk = 0.0
    fees = 0.0
    funding = 0.0
    slip_liq = 0.0
    slip_time = 0.0

    for p in positions:
        risk = getattr(p, "risk_amount_usdt", None)
        if not risk or risk <= 0.0:
            continue
        total_risk += float(risk)
        fees += float(p.fee_open_usdt or 0.0) + float(p.fee_close_usdt or 0.0)
        funding += float(p.funding_usdt or 0.0)
        slip_liq += float(p.slippage_entry_usdt or 0.0) + float(p.slippage_exit_usdt or 0.0)
        slip_time += float(p.slippage_timelag_usdt or 0.0)

    if total_risk <= 0.0:
        return {
            "fees": 0.0,
            "funding": 0.0,
            "slip_liquidity": 0.0,
            "slip_time": 0.0,
            "total": 0.0,
        }

    total_cost = fees + funding + slip_liq + slip_time
    return {
        "fees": fees / total_risk * 100.0,
        "funding": funding / total_risk * 100.0,
        "slip_liquidity": slip_liq / total_risk * 100.0,
        "slip_time": slip_time / total_risk * 100.0,
        "total": total_cost / total_risk * 100.0,
    }


def _timelag_kpis_for_range(
    db: Session,
    user_id: int,
    dt_from: Optional[datetime],
    dt_to: Optional[datetime],
    bot_ids: Optional[List[int]],
    symbols: Optional[List[str]],
    direction: Optional[str],
    open_rng: HourRange,
    close_rng: HourRange,
) -> Dict[str, Any]:
    """
    Durchschnittliche Timelag-Segmente in Millisekunden:
      - ingress_ms_avg    = bot_received_at - tv_ts
      - engine_ms_avg     = processed_at    - bot_received_at  (falls vorhanden)
      - tv_to_send_ms_avg = sent_at         - tv_ts
      - tv_to_fill_ms_avg = first_exec_at   - tv_ts            (falls vorhanden)
    Gefiltert nach closed_at in [dt_from, dt_to).


    NEU:
    - entry     = bot_received_at   -   tv_ts
    - engine    = processet_at      -   bot_received_at    
    - exit      = first_exec_at     -   sent_at
    """
    q = (
        db.query(models.Position, models.TvSignal, models.OutboxItem)
          .join(models.TvSignal, models.Position.tv_signal_id == models.TvSignal.id)
          .join(models.OutboxItem, models.Position.outbox_item_id == models.OutboxItem.id)
          .filter(models.Position.user_id == user_id)
          .filter(models.Position.status == "closed")
    )

    if bot_ids:
        q = q.filter(models.Position.bot_id.in_(bot_ids))
    if symbols:
        q = q.filter(models.Position.symbol.in_(symbols))
    if dt_from:
        q = q.filter(models.Position.closed_at >= dt_from)
    if dt_to:
        q = q.filter(models.Position.closed_at < dt_to)

    rows = q.all()

    entry, engine, exit = [], [], []
    for p, tv, ob in rows:
        opened_at = _to_utc_aware(p.opened_at)
        closed_at = _to_utc_aware(p.closed_at)
        
        if not _dir_ok(p, direction):
            continue
        if not time_in_range(p.opened_at, open_rng):
            continue
        if not time_in_range(p.closed_at, close_rng):
            continue

        if getattr(tv, "tv_ts", None) and getattr(tv, "bot_received_at", None):
            entry.append((tv.bot_received_at - tv.tv_ts).total_seconds() * 1000.0)

        if getattr(tv, "processed_at", None) and getattr(tv, "bot_received_at", None):
            engine.append((tv.processed_at - tv.bot_received_at).total_seconds() * 1000.0)

        if getattr(ob, "sent_at", None) and getattr(tv, "tv_ts", None):
            exit.append((ob.sent_at - tv.processed_at).total_seconds() * 1000.0)
    def _avg(lst: List[float]) -> Optional[float]:
        return (sum(lst) / len(lst)) if lst else None

    return {
        "entry_ms_avg": _avg(entry),
        "engine_ms_avg": _avg(engine),
        "exit_ms_avg": _avg(exit),
        "samples": len(rows),
    }

# ----------------------------
# Öffentliche API
# ----------------------------

@dataclass
class SummaryFilters:
    bot_ids: Optional[List[int]] = None
    symbols: Optional[List[str]] = None
    direction: Optional[str] = None  # "long" | "short" | "both"| None
    open_hour_range: HourRange = None
    close_hour_range: HourRange = None
    # Globale Zeitfilter für Portfolio/Timeseries (nur Zeit! keine Bot/Symbol-Filter)
    date_from: Optional[date] = None
    date_to: Optional[date] = None

def compute_dashboard_summary(db: Session, user_id: int, f: SummaryFilters) -> Dict[str, Any]:
    """
    Liefert:
      - portfolio_total_equity (nur ZEIT-gefiltert)
      - KPIs (today / month / last_30d / current)
        * realized_pnl
        * win_rate
        * tx_breakdown_usdt (fees/funding/slippage in USDT)
        * timelag_ms (ingress/engine/tv->send/tv->fill)
      - equity_timeseries (Tag × (realized PnL + Netto-Cashflows))
    """
    now = utc_now()
    today = now.date()

    # KPI-Zeitfenster
    kpi_today_from = start_of_day_utc(today)
    kpi_today_to = kpi_today_from + timedelta(days=1)
    kpi_month_from = start_of_month_utc(today)
    kpi_month_to = start_of_day_utc(today + timedelta(days=1))
    kpi_last30_from = days_ago_utc(30)
    kpi_last30_to = now

    # 1) Portfolio – nur ZEIT-Filter
    pf_from_dt: Optional[datetime] = start_of_day_utc(f.date_from) if f.date_from else None
    pf_to_dt: Optional[datetime] = start_of_day_utc(f.date_to + timedelta(days=1)) if f.date_to else None

    pq = (
        db.query(models.Position)
          .filter(models.Position.user_id == user_id)
          .filter(models.Position.status == "closed")
    )
    if pf_from_dt:
        pq = pq.filter(models.Position.closed_at >= pf_from_dt)
    if pf_to_dt:
        pq = pq.filter(models.Position.closed_at < pf_to_dt)

    realized_pnl_total = sum(float(p.pnl_usdt or 0.0) for p in pq.all())

    cq = db.query(models.Cashflow).filter(models.Cashflow.user_id == user_id)
    if pf_from_dt:
        cq = cq.filter(models.Cashflow.ts >= pf_from_dt)
    if pf_to_dt:
        cq = cq.filter(models.Cashflow.ts < pf_to_dt)

    dep = 0.0
    wdr = 0.0
    for c in cq.all():
        if (c.direction or "").lower() == "deposit":
            dep += float(c.amount_usdt or 0.0)
        elif (c.direction or "").lower() == "withdraw":
            wdr -= float(c.amount_usdt or 0.0)
    portfolio_total_equity = realized_pnl_total + dep + wdr  # wdr ist hier bereits negativ

    # 2) Positionsbasis für KPIs (mit Bot/Symbol-Filtern)
    base_q = db.query(models.Position).filter(models.Position.user_id == user_id)
    if f.bot_ids:
        base_q = base_q.filter(models.Position.bot_id.in_(f.bot_ids))
    if f.symbols:
        base_q = base_q.filter(models.Position.symbol.in_(f.symbols))

    positions_all = base_q.all()
    open_positions = [p for p in positions_all if p.closed_at is None]
    closed_positions = [p for p in positions_all if p.closed_at is not None]

    def _closed_in(p, dt_from, dt_to):
        if p.closed_at is None:
            return False
        closed_at = _to_utc_aware(p.closed_at)
        return (closed_at >= dt_from) and (closed_at < dt_to)

    def _apply_intraday_and_dir(pl: Iterable[models.Position]) -> List[models.Position]:
        res = []

        for p in pl:
            opened_at = _to_utc_aware(p.opened_at)
            closed_at = _to_utc_aware(p.closed_at)

            if not _dir_ok(p, f.direction):
                continue
            if not time_in_range(opened_at, f.open_hour_range):
                continue
            if not time_in_range(closed_at, f.close_hour_range):
                continue
            res.append(p)
        return res

    today_pos = _apply_intraday_and_dir([p for p in closed_positions if _closed_in(p, kpi_today_from, kpi_today_to)])
    month_pos = _apply_intraday_and_dir([p for p in closed_positions if _closed_in(p, kpi_month_from, kpi_month_to)])
    last30_pos = _apply_intraday_and_dir([p for p in closed_positions if _closed_in(p, kpi_last30_from, kpi_last30_to)])

    # Overall-Positionen (Gesamtansicht basierend auf date_from/date_to)
    if f.date_from or f.date_to:
        overall_raw: List[models.Position] = []
        overall_from = start_of_day_utc(f.date_from) if f.date_from else None
        overall_to = start_of_day_utc(f.date_to + timedelta(days=1)) if f.date_to else None

        for p in closed_positions:
            if p.closed_at is None:
                continue
            closed_at = _to_utc_aware(p.closed_at)
            if overall_from and closed_at < overall_from:
                continue
            if overall_to and closed_at >= overall_to:
                continue
            overall_raw.append(p)
    else:
        # Kein Datumsfilter gesetzt → gesamte Historie für die Gesamtansicht nutzen
        overall_raw = list(closed_positions)

    overall_pos = _apply_intraday_and_dir(overall_raw)

    # Realized & Winrate (inkl. Gesamtansicht)
    def _realized(pl: Iterable[models.Position]) -> float:
        return sum(float(p.pnl_usdt or 0.0) for p in pl)

    today_realized = _realized(today_pos)
    month_realized = _realized(month_pos)
    last30_realized = _realized(last30_pos)
    overall_realized = _realized(overall_pos)

    def _wins(pl: Iterable[models.Position]) -> int:
        return sum(1 for p in pl if float(p.pnl_usdt or 0.0) > 0.0)

    today_wins = _wins(today_pos)
    month_wins = _wins(month_pos)
    last30_wins = _wins(last30_pos)
    overall_wins = _wins(overall_pos)

    today_total = len(today_pos)
    month_total = len(month_pos)
    last30_total = len(last30_pos)
    overall_total = len(overall_pos)

    # USDT-Breakdown
    tx_today = _sum_usdt_tx(today_pos)
    tx_month = _sum_usdt_tx(month_pos)
    tx_last30 = _sum_usdt_tx(last30_pos)
    tx_overall = _sum_usdt_tx(overall_pos)

    # Tx-Breakdown in % pro Faktor
    tx_today_pct = _tx_breakdown_pct(today_pos)
    tx_month_pct = _tx_breakdown_pct(month_pos)
    tx_last30_pct = _tx_breakdown_pct(last30_pos)
    tx_overall_pct = _tx_breakdown_pct(overall_pos)

    # Timelag-KPIs
    tl_today = _timelag_kpis_for_range(db, user_id, kpi_today_from, kpi_today_to, f.bot_ids, f.symbols, f.direction, f.open_hour_range, f.close_hour_range)
    tl_month = _timelag_kpis_for_range(db, user_id, kpi_month_from, kpi_month_to, f.bot_ids, f.symbols, f.direction, f.open_hour_range, f.close_hour_range)
    tl_last30 = _timelag_kpis_for_range(db, user_id, kpi_last30_from, kpi_last30_to, f.bot_ids, f.symbols, f.direction, f.open_hour_range, f.close_hour_range)
    tl_overall = _timelag_kpis_for_range(db, user_id, pf_from_dt, pf_to_dt, f.bot_ids, f.symbols, f.direction, f.open_hour_range, f.close_hour_range)

    # 3) Equity Timeseries (nur ZEIT-basierend)
    ts_from = start_of_day_utc(f.date_from) if f.date_from else start_of_day_utc((utc_now() - timedelta(days=30)).date())
    ts_to = start_of_day_utc(f.date_to + timedelta(days=1)) if f.date_to else start_of_day_utc(today + timedelta(days=1))

    eq_by_day = defaultdict(float)

    pq_ts = (
        db.query(models.Position)
          .filter(models.Position.user_id == user_id)
          .filter(models.Position.status == "closed")
          .filter(models.Position.closed_at >= ts_from)
          .filter(models.Position.closed_at < ts_to)
          .with_entities(models.Position.closed_at, models.Position.pnl_usdt)
    )
    for closed_at, pnl_usdt in pq_ts.all():
        d = closed_at.astimezone(timezone.utc).date()
        eq_by_day[d] += float(pnl_usdt or 0.0)

    cq_ts = (
        db.query(models.Cashflow)
          .filter(models.Cashflow.user_id == user_id)
          .filter(models.Cashflow.ts >= ts_from)
          .filter(models.Cashflow.ts < ts_to)
          .with_entities(models.Cashflow.ts, models.Cashflow.direction, models.Cashflow.amount_usdt)
    )
    for ts, direction, amt in cq_ts.all():
        d = ts.astimezone(timezone.utc).date()
        if (direction or "").lower() == "deposit":
            eq_by_day[d] += float(amt or 0.0)
        elif (direction or "").lower() == "withdraw":
            eq_by_day[d] -= float(amt or 0.0)

    equity_timeseries = [
        {"ts": datetime(d.year, d.month, d.day, tzinfo=timezone.utc).isoformat(), "day_pnl": eq_by_day[d]}
        for d in sorted(eq_by_day.keys())
    ]

    # 4) Zusammenbau
    summary: Dict[str, Any] = {
        "portfolio_total_equity": portfolio_total_equity,  # nur ZEIT-gefiltert
        "cashflows": {
            "deposits_usdt": dep,
            "withdrawals_usdt": -wdr,          # positiv als Betrag
            "net_cashflow_usdt": dep + wdr,    # gleiche Logik wie oben
        },
        "kpis": {
            "overall": {
                "realized_pnl": overall_realized,
                "win_rate": safe_rate(overall_wins, overall_total),
                "trade_count": overall_total,
                "tx_breakdown_usdt": tx_overall,
                "tx_breakdown_pct": tx_overall_pct, 
                "timelag_ms": tl_overall,
            },
            "today": {
                "realized_pnl": today_realized,
                "win_rate": safe_rate(today_wins, today_total),
                "trade_count": today_total, 
                "tx_breakdown_usdt": tx_today,
                "tx_breakdown_pct": tx_today_pct, 
                "timelag_ms": tl_today,
            },
            "month": {
                "realized_pnl": month_realized,
                "win_rate": safe_rate(month_wins, month_total),
                "trade_count": month_total,
                "tx_breakdown_usdt": tx_month,
                "tx_breakdown_pct": tx_month_pct, 
                "timelag_ms": tl_month,
            },
            "last_30d": {
                "realized_pnl": last30_realized,
                "win_rate": safe_rate(last30_wins, last30_total),
                "trade_count": last30_total,
                "tx_breakdown_usdt": tx_last30,
                "tx_breakdown_pct": tx_last30_pct, 
                "timelag_ms": tl_last30,
            },
            "current": {
                "open_trades": len([p for p in open_positions if _dir_ok(p, f.direction) and time_in_range(p.opened_at, f.open_hour_range)]),
                # optionaler Platzhalter für UI:
                "win_rate": safe_rate(today_wins, today_total),
            },
        },
        "equity_timeseries": equity_timeseries,
    }
    return summary

# -----------------------------------------
# Backward-kompatible Wrapper (Namensgleich)
# -----------------------------------------

def _period_closed_positions(db: Session, user_id: int, start_dt: datetime) -> List[models.Position]:
    """Alle geschlossenen Positionen ab start_dt (UTC)."""
    return (
        db.query(models.Position)
          .filter(models.Position.user_id == user_id)
          .filter(models.Position.status == "closed")
          .filter(models.Position.closed_at >= start_dt)
          .all()
    )

def _period_realized(db: Session, user_id: int, start_dt: datetime) -> float:
    """Realized PnL ab start_dt (UTC)."""
    return sum(float(p.pnl_usdt or 0.0) for p in _period_closed_positions(db, user_id, start_dt))

def _period_balance(db: Session, user_id: int, start_dt: datetime) -> float:
    """
    Netto-Cashflows ab start_dt (UTC).
    Hinweis: Nutzt models.Cashflow (deposit/withdraw).
    """
    flows = (
        db.query(models.Cashflow)
          .filter(models.Cashflow.user_id == user_id)
          .filter(models.Cashflow.ts >= start_dt)
          .all()
    )
    net = 0.0
    for c in flows:
        d = (c.direction or "").lower()
        if d == "deposit":
            net += float(c.amount_usdt or 0.0)
        elif d == "withdraw":
            net -= float(c.amount_usdt or 0.0)
    return net

def _trade_counts(positions: Iterable[models.Position]) -> Tuple[int, int]:
    """(wins, total)"""
    lst = list(positions)
    wins = sum(1 for p in lst if float(p.pnl_usdt or 0.0) > 0.0)
    return wins, len(lst)

def _extract_pct_lists(positions: Iterable[models.Position]) -> Dict[str, List[float]]:
    """
    Liefert Listen (für Prozentberechnungen im Frontend) – ohne Filter auf risk_amount.
    """
    fees = []
    funding = []
    slip_liq = []
    slip_time = []
    for p in positions:
        fees.append(float(p.fee_open_usdt or 0.0) + float(p.fee_close_usdt or 0.0))
        funding.append(float(p.funding_usdt or 0.0))
        slip_liq.append(float(p.slippage_entry_usdt or 0.0) + float(p.slippage_exit_usdt or 0.0))
        slip_time.append(float(p.slippage_timelag_usdt or 0.0))
    return {"fees": fees, "funding": funding, "slip_liquidity": slip_liq, "slip_time": slip_time}
