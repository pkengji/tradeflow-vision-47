# app/services/pnl.py

from typing import Optional

def compute_pnl(
    *,
    side: str,
    qty: float,
    entry_price: float,
    mark_price: float,
    fees_open: float = 0.0,
    fees_close: float = 0.0,
) -> float:
    """
    Standard-PnL in USDT.
    Long  : (mark - entry) * qty - fees
    Short : (entry - mark) * qty - fees
    """
    if qty is None:
        qty = 0.0
    if entry_price is None:
        entry_price = 0.0
    if mark_price is None:
        mark_price = 0.0

    side = (side or "long").lower()

    if side == "long":
        gross = (mark_price - entry_price) * qty
    else:
        gross = (entry_price - mark_price) * qty

    return gross - (fees_open or 0.0) - (fees_close or 0.0)


def compute_slippage(side: str, trigger: float | None, best: float | None, vwap: float | None):
    if trigger is None or vwap is None or trigger == 0:
        return None
    sign = 1 if (side or "long").lower() == "long" else -1
    signal_pct = sign * (((best - trigger) / trigger * 100) if (best not in (None, 0)) else None)
    book_pct   = sign * (((vwap - best) / best * 100) if (best not in (None, 0)) else None)
    total_pct  = sign * ((vwap - trigger) / trigger * 100)
    return {
        "signal_slippage_pct": signal_pct,
        "book_slippage_pct": book_pct,
        "total_slippage_pct": total_pct,
    }

