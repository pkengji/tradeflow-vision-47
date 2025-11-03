from __future__ import annotations

from typing import Optional, Tuple, Dict, Any, List
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app.bybit_v5_data import BybitV5Data


# ---------- Helpers ----------

def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)

def _to_ms(dt: datetime | None) -> Optional[int]:
    if not dt:
        return None
    return int(dt.timestamp() * 1000)

def _dt_ms(ms: Optional[int]) -> Optional[datetime]:
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    except Exception:
        return None

def _parse_date_to_bounds(date_from: Optional[str], date_to: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Accepts ISO (YYYY-MM-DD) or full ISO datetime. Produces [from, to) bounds in UTC.
    """
    def _parse_one(s: str) -> datetime:
        # try YYYY-MM-DD first
        try:
            y, m, d = [int(x) for x in s[:10].split("-")]
            return datetime(y, m, d, tzinfo=timezone.utc)
        except Exception:
            # fallback: parse as full iso
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)

    df: Optional[datetime] = _parse_one(date_from) if date_from else None
    dt: Optional[datetime] = _parse_one(date_to) if date_to else None
    if dt and (len(date_to) == 10 or date_to.endswith("T00:00:00") or date_to.endswith("T00:00:00Z")):
        # if plain date for 'to', make it exclusive end by adding 1 day
        dt = dt + timedelta(days=1)
    return df, dt


# ---------- External / Internal detection ----------

def _is_internal_deposit(item: Dict[str, Any]) -> bool:
    """
    Heuristics based on Bybit v5 payload. We treat unknowns as external=False only if clearly internal.
    Common keys we may see: 'fromType', 'toType', 'status', 'txID', 'chainType'
    """
    from_type = (item.get("fromType") or "").upper()
    to_type = (item.get("toType") or "").upper()
    # main<->sub moves are internal
    if ("MAIN" in from_type and "SUB" in to_type) or ("SUB" in from_type and "MAIN" in to_type):
        return True
    # explicit internal markers (if any vendor-specific)
    t = (item.get("transferType") or "").lower()
    if "internal" in t:
        return True
    return False

def _is_internal_withdrawal(item: Dict[str, Any]) -> bool:
    """
    Heuristics for withdrawal records. If withdrawType or route indicates on-chain vs. internal,
    we only persist on-chain/external.
    """
    wtype = (item.get("withdrawType") or item.get("type") or "").lower()
    route = (item.get("toAddressType") or "").lower()
    # anything indicating 'internal' stays internal
    if "internal" in wtype or "internal" in route:
        return True
    return False


# ---------- Sync cashflows from Bybit ----------

def _persist_cashflow(
    db: Session,
    *,
    user_id: int,
    direction: str,  # 'deposit' | 'withdraw'
    amount_usdt: float,
    currency: str,
    ts: Optional[datetime],
    tx_id: Optional[str],
    account_kind: Optional[str] = None,  # 'main' | 'sub' | None
    external_addr: Optional[str] = None,
    is_internal: bool = False,
    raw_json: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Insert if not exists (by unique tx_id+direction+user) or if tx_id is missing,
    fall back to (user_id, direction, amount_usdt, ts) de-duplication.
    Returns True if inserted, False if skipped (duplicate).
    """
    # primary: tx_id present?
    if tx_id:
        exists = (
            db.query(models.Cashflow)
              .filter(models.Cashflow.user_id == user_id)
              .filter(models.Cashflow.direction == direction)
              .filter(models.Cashflow.tx_id == tx_id)
              .first()
        )
        if exists:
            return False

    # secondary: fuzzy dedupe for missing tx_id
    if not tx_id and ts is not None:
        exists2 = (
            db.query(models.Cashflow)
              .filter(models.Cashflow.user_id == user_id)
              .filter(models.Cashflow.direction == direction)
              .filter(models.Cashflow.ts == ts)
              .filter(models.Cashflow.amount_usdt == amount_usdt)
              .first()
        )
        if exists2:
            return False

    cf = models.Cashflow(
        user_id=user_id,
        bot_id=None,
        account_kind=account_kind,
        direction=direction,
        amount_usdt=float(amount_usdt or 0.0),
        currency=currency or "USDT",
        tx_id=tx_id,
        external_addr=external_addr,
        is_internal=bool(is_internal),
        ts=ts,
        raw_json=raw_json or {},
    )
    db.add(cf)
    return True


def sync_cashflows(
    db: Session,
    *,
    user_id: int,
    api_key: str,
    api_secret: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    coin: str = "USDT",
) -> Dict[str, Any]:
    """
    Pulls deposits and withdrawals for the user's main account.
    Only persists EXTERNAL flows (internal main<->sub ignored).
    """
    client = BybitV5Data(api_key, api_secret)
    df, dt = _parse_date_to_bounds(date_from, date_to)
    start_ms = _to_ms(df) if df else None
    end_ms = _to_ms(dt) if dt else None

    inserted = {"deposit": 0, "withdraw": 0}
    # --- Deposits
    cursor = None
    while True:
        res = client.deposits(coin=coin, startTime=start_ms, endTime=end_ms, cursor=cursor, limit=50)
        data = (res or {}).get("result") or {}
        lst: List[Dict[str, Any]] = data.get("rows") or data.get("list") or []
        for it in lst:
            if _is_internal_deposit(it):
                continue
            amt = float(it.get("amount") or it.get("amt") or 0.0)
            ts = _dt_ms(it.get("successAt") or it.get("timestamp") or it.get("ts"))
            txid = it.get("txID") or it.get("txId") or it.get("hash")
            addr = it.get("toAddress") or it.get("address")
            ok = _persist_cashflow(
                db,
                user_id=user_id,
                direction="deposit",
                amount_usdt=amt,
                currency=coin,
                ts=ts,
                tx_id=txid,
                account_kind="main",
                external_addr=addr,
                is_internal=False,
                raw=it,
            )
            if ok:
                inserted["deposit"] += 1
        cursor = data.get("nextPageCursor")
        if not cursor:
            break

    # --- Withdrawals
    cursor = None
    while True:
        res = client.withdrawals(coin=coin, startTime=start_ms, endTime=end_ms, cursor=cursor, limit=50)
        data = (res or {}).get("result") or {}
        lst: List[Dict[str, Any]] = data.get("rows") or data.get("list") or []
        for it in lst:
            if _is_internal_withdrawal(it):
                continue
            amt = float(it.get("amount") or it.get("amt") or 0.0)
            ts = _dt_ms(it.get("successAt") or it.get("timestamp") or it.get("ts"))
            txid = it.get("txID") or it.get("txId") or it.get("hash")
            addr = it.get("toAddress") or it.get("address")
            ok = _persist_cashflow(
                db,
                user_id=user_id,
                direction="withdraw",
                amount_usdt=amt,
                currency=coin,
                ts=ts,
                tx_id=txid,
                account_kind="main",
                external_addr=addr,
                is_internal=False,
                raw_json=it,
            )
            if ok:
                inserted["withdraw"] += 1
        cursor = data.get("nextPageCursor")
        if not cursor:
            break

    db.commit()
    return {"ok": True, "inserted": inserted, "coin": coin, "from": df.isoformat() if df else None, "to": dt.isoformat() if dt else None}


# ---------- Portfolio value ----------

def compute_portfolio_value(
    db: Session,
    *,
    user_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Portfolio Value = Σ Deposits - Σ Withdrawals + Σ Realized PnL (closed positions)
    Scope: ALL bots of the user, date-filtered by ts/closed_at.
    """
    df, dt = _parse_date_to_bounds(date_from, date_to)

    # Cashflows (external only)
    q_cf = db.query(models.Cashflow).filter(models.Cashflow.user_id == user_id)
    if df:
        q_cf = q_cf.filter(models.Cashflow.ts >= df)
    if dt:
        q_cf = q_cf.filter(models.Cashflow.ts < dt)

    # external only
    q_cf = q_cf.filter(models.Cashflow.is_internal == False)

    deposits_sum = q_cf.with_entities(func.coalesce(func.sum(
        func.case((models.Cashflow.direction == "deposit", models.Cashflow.amount_usdt), else_=0.0)
    ), 0.0)).scalar() or 0.0

    withdrawals_sum = q_cf.with_entities(func.coalesce(func.sum(
        func.case((models.Cashflow.direction == "withdraw", models.Cashflow.amount_usdt), else_=0.0)
    ), 0.0)).scalar() or 0.0

    # Realized PnL across all bots of the user
    bot_ids = [b.id for b in db.query(models.Bot).filter(models.Bot.user_id == user_id, models.Bot.is_deleted == False).all()]
    realized_pnl = 0.0
    if bot_ids:
        q_pos = (
            db.query(func.coalesce(func.sum(models.Position.pnl_usdt), 0.0))
              .filter(models.Position.bot_id.in_(bot_ids))
              .filter(models.Position.status == "closed")
        )
        if df:
            q_pos = q_pos.filter(models.Position.closed_at >= df)
        if dt:
            q_pos = q_pos.filter(models.Position.closed_at < dt)
        realized_pnl = float(q_pos.scalar() or 0.0)

    portfolio_value = float(deposits_sum) - float(withdrawals_sum) + float(realized_pnl)

    return {
        "ok": True,
        "from": df.isoformat() if df else None,
        "to": dt.isoformat() if dt else None,
        "deposits": float(deposits_sum),
        "withdrawals": float(withdrawals_sum),
        "realized_pnl": float(realized_pnl),
        "portfolio_value": float(portfolio_value),
    }
