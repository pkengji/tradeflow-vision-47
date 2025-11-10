# app/services/symbols.py
from __future__ import annotations
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta

import os, io, requests

from sqlalchemy.orm import Session
from sqlalchemy import select

from .. import models


# Versuche deinen bestehenden v5-Client zu nutzen (signiert); Market-Info ist public,
# aber wir verwenden _request falls vorhanden.
try:
    from ..bybit_v5 import BybitV5Client  # dein existierender Client
except Exception:
    BybitV5Client = None  # type: ignore

ICONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

# --- Utils ---

def _now_utc():
    return datetime.now(timezone.utc)

def _decimals_from_increment(x: float) -> int:
    """
    Leitet die Anzahl Nachkommastellen aus tick_size/step_size ab.
    0.01 -> 2, 0.001 -> 3, 0.5 -> 1, 1.0 -> 0
    """
    if x is None:
        return 0
    s = f"{x:.12f}".rstrip("0").rstrip(".")
    if "." not in s:
        return 0
    return len(s.split(".")[1])

def _float(s: Any, default: float = 0.0) -> float:
    try:
        return float(s)
    except Exception:
        return default

# --- Public Bybit fetch (Market Instruments) ---

def _fetch_all_linear_usdt_instruments(bybit: Optional[Any] = None) -> List[Dict[str, Any]]:
    """
    Liefert alle USDT-Perpetual-Instrumente (status=Trading) von Bybit.
    Erwartet ein Obj mit _request("GET", "/v5/market/instruments-info", query=...),
    fällt andernfalls auf requests.get zurück (public).
    """
    items: List[Dict[str, Any]] = []
    cursor = None
    for _ in range(20):  # pagination guard
        q = {"category": "linear", "limit": 1000}
        if cursor: q["cursor"] = cursor

        if bybit and hasattr(bybit, "_request"):
            res = bybit._request("GET", "/v5/market/instruments-info", query=q)  # type: ignore
        else:
            import requests
            r = requests.get("https://api.bybit.com/v5/market/instruments-info", params=q, timeout=15)
            r.raise_for_status()
            res = r.json()

        data = (res.get("result") or {})
        lst = (data.get("list") or [])
        for it in lst:
            # Filter: USDT-Perp & Trading
            quote = (it.get("quoteCoin") or "").upper()
            status = (it.get("status") or "").lower()
            ctype = (it.get("contractType") or "").lower()
            if quote == "USDT" and "perpetual" in ctype and status == "trading":
                items.append(it)

        cursor = data.get("nextPageCursor")
        if not cursor:
            break

    # Deduplizieren nach symbol
    seen = set()
    out: List[Dict[str, Any]] = []
    for it in items:
        sym = it.get("symbol")
        if not sym or sym in seen: 
            continue
        seen.add(sym)
        out.append(it)
    return out

# --- Upsert in DB ---

def sync_symbols_linear_usdt(db: Session, bybit_client: Optional[Any] = None) -> int:
    instruments = _fetch_all_linear_usdt_instruments(bybit_client)
    updated = 0
    now = _now_utc()

    for it in instruments:
        symbol = (it.get("symbol") or "").upper()
        base = (it.get("baseCoin") or "").upper()
        quote = (it.get("quoteCoin") or "").upper()
        tick_size = _float(it.get("priceFilter", {}).get("tickSize") or it.get("tickSize") or it.get("priceTickSize"))
        step_size = _float(it.get("lotSizeFilter", {}).get("qtyStep") or it.get("stepSize") or it.get("qtyStep"))
        max_leverage = _float(it.get("leverageFilter", {}).get("maxLeverage") or it.get("maxLeverage") or 100.0)

        row = db.execute(select(models.Symbol).where(models.Symbol.symbol == symbol)).scalar_one_or_none()
        if row:
            row.tick_size = tick_size or row.tick_size
            row.step_size = step_size or row.step_size
            row.base_currency = base or row.base_currency
            row.quote_currency = quote or row.quote_currency
            row.max_leverage = max_leverage or row.max_leverage
            row.refreshed_at = now
        else:
            row = models.Symbol(
                symbol=symbol,
                tick_size=tick_size or 0.0,
                step_size=step_size or 0.0,
                base_currency=base or "",
                quote_currency=quote or "USDT",
                max_leverage=max_leverage or 100.0,
                refreshed_at=now,
            )
            db.add(row)

        ensure_symbol_icon(db, row, max_age_days=0)
        updated += 1

    db.commit()
    print(f"[SYNC] Updated {updated} symbols")
    return updated

# --- Query Helpers für API ---

def _base_from_symbol(sym: str) -> str:
    # "BTCUSDT" → "BTC"
    return (sym or "").upper().replace("USDT", "").replace("USD", "").replace("PERP", "")

def _candidate_icon_urls(base: str) -> list[str]:
    b = base.lower()
    return [
        # Coinpaprika: sehr gute Abdeckung, korrektes Format
        f"https://static.coinpaprika.com/coin/{b}-{b}/logo.png",
        # Coingecko: funktioniert für große Coins (279 = Ethereum, 1 = Bitcoin, etc.)
        f"https://assets.coingecko.com/coins/images/1/large/{b}.png",
        f"https://assets.coingecko.com/coins/images/279/large/{b}.png",
        # Fallback: großes öffentliches GitHub-Iconset
        f"https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/64/color/{b}.png",
        f"https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/32/color/{b}.png",
    ]


def _fetch_first_ok(urls: list[str]) -> tuple[bytes, str] | tuple[None, None]:
    for u in urls:
        try:
            r = requests.get(u, timeout=6)
            if r.ok and r.content:
                return r.content, u
        except Exception:
            pass
    return None, None

def ensure_symbol_icon(db: Session, sym: models.Symbol, max_age_days: int = 30) -> str | None:
    """
    Stellt sicher, dass das Icon lokal vorliegt (app/static/icons/<base>.png).
    Gibt die relative URL zurück: '/static/icons/<base>.png' oder None.
    """
    base = _base_from_symbol(sym.symbol)
    if not base:
        return None

    filename = f"{base.lower()}.png"
    local_rel = f"icons/{filename}"
    local_abs = os.path.join(ICONS_DIR, filename)

    fresh_enough = (
        sym.icon_last_synced_at
        and (datetime.now(timezone.utc) - sym.icon_last_synced_at) < timedelta(days=max_age_days)
    )

    # Wenn bereits lokal und frisch genug → reuse
    if sym.icon_local_path and os.path.exists(local_abs) and fresh_enough:
        return f"/static/{sym.icon_local_path}"

    # 🔥 Download forcieren, wenn kein lokales oder abgelaufenes Icon
    content, src = _fetch_first_ok(_candidate_icon_urls(base))
    if content:
        os.makedirs(ICONS_DIR, exist_ok=True)
        with open(local_abs, "wb") as f:
            f.write(content)
        sym.icon_local_path = local_rel
        sym.icon_url = src
        sym.icon_last_synced_at = datetime.now(timezone.utc)
        db.add(sym)
        # ⚠️ flush reicht hier, commit im aufrufenden Code
        db.flush()
        print(f"[ICON] Saved {base} -> {local_rel}")
        return f"/static/{local_rel}"

    print(f"[ICON] Not found for {base}")
    return None


def list_pairs_payload(db: Session) -> list[dict]:
    rows = db.execute(select(models.Symbol).order_by(models.Symbol.symbol.asc())).scalars().all()
    out = []
    for r in rows:
        price_decimals = _decimals_from_increment(r.tick_size or 0.0)
        qty_decimals = _decimals_from_increment(r.step_size or 0.0)
        base = (r.base_currency or "").upper()

        # NEU: Icon lokal sicherstellen (nicht bei jedem Request – max_age z.B. 30 Tage)
        icon_url = ensure_symbol_icon(db, r, max_age_days=30) or r.icon_url \
                   or f"https://cryptoicons.org/api/icon/{base.lower()}/64"

        out.append({
            "symbol": r.symbol,
            "name": base,
            "icon": icon_url,                       # bevorzugt lokal
            "base": base,
            "quote": (r.quote_currency or "").upper(),
            "price_decimals": price_decimals,
            "qty_decimals": qty_decimals,
            "tick_size": r.tick_size,
            "step_size": r.step_size,
            "max_leverage": r.max_leverage,
            "refreshed_at": (r.refreshed_at.isoformat() if r.refreshed_at else None),
        })
    return out
