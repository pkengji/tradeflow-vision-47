import os
from sqlalchemy import select

from fastapi import FastAPI, Depends, HTTPException, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security.api_key import APIKeyHeader
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
import secrets
from .models import Bot, Position
from sqlalchemy import or_, select, func
from .services.bybit_sync import sync_backfill_since, sync_recent_closures, quick_sync_symbol, sync_full_history, rebuild_positions,sync_symbol_recent, sync_recent_all_bots
from .services.symbols import sync_symbols_linear_usdt, list_pairs_payload
from collections import defaultdict
from datetime import datetime, timezone, date
from app.services.positions import handle_position_close

from .database import Base, engine, SessionLocal
from . import models, schemas
from .schemas import (
    UserOut, CreateUserBody, UpdateUserBody, UpdatePasswordBody, WebhookSecretOut, LoginBody,
    BotCreate, BotOut, BotUpdate, BotExchangeKeysIn, BotExchangeKeysOut, BotSymbolSettingIn, BotSymbolSettingOut, SymbolOut,
    PositionOut, PositionsResponse, OutboxOut, DailyPnlPoint
)
from . import crud

app = FastAPI(title="TradingBot Backend (User Scope Patch)", version="0.3.0")

ALLOWED_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:5173", "http://127.0.0.1:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

position_cache: dict[tuple[int, str], dict] = {}   # key = (bot_id, symbol)


# ---------- DB Session ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- Current User (Header-based) ----------
def get_current_user_id(db: Session = Depends(get_db), request: Request = None) -> int:
    """
    Bestimmt den aktuellen User:
    1) Wenn ein 'uid'-Cookie existiert und gültig ist -> diesen User verwenden.
    2) Falls kein Cookie: Single-User-Fallback
       - existiert genau 1 User -> diesen verwenden
       - existiert noch kein User -> automatisch Default-User anlegen und verwenden
    3) Gibt die User-ID zurück.
    """
    # 1) Cookie versuchen
    try:
        uid_cookie = request.cookies.get("uid") if request else None
        if uid_cookie:
            uid = int(uid_cookie)
            u = db.query(models.User).filter(models.User.id == uid).first()
            if u:
                return u.id
    except Exception:
        pass


    # 2) Single-User-Fallback
    existing = db.query(models.User).order_by(models.User.id.asc()).all()
    if len(existing) == 1:
        return existing[0].id
    if len(existing) == 0:
        # auto-create default user
        import secrets
        u = models.User(
            username="admin",
            email="admin@example.com",
            password_hash="admin",   # TODO: später hashen!
            role="admin",
            webhook_secret=secrets.token_hex(16),
        )
        db.add(u); db.commit(); db.refresh(u)
        return u.id

    # 3) Mehrere User vorhanden, aber kein Cookie gesetzt -> sicherer Fehler
    # (alternativ: nimm den ältesten, aber besser explizit einloggen)
    raise HTTPException(status_code=401, detail="No active session. Please login to set uid cookie.")
    
    
# ---------- Users ----------
@app.post("/api/v1/users", response_model=UserOut)
def create_user(body: CreateUserBody, db: Session = Depends(get_db)):
    # NOTE: password hashing omitted for brevity
    u = models.User(
        username=body.username,
        email=body.email,
        password_hash=body.password,
        role=body.role or "user",
        webhook_secret=secrets.token_hex(16),
    )
    db.add(u); db.commit(); db.refresh(u)
    return u

@app.get("/api/v1/me", response_model=UserOut)
def get_me(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u: raise HTTPException(404, "User not found")
    return u

@app.patch("/api/v1/me", response_model=UserOut)
def update_me(body: UpdateUserBody, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u: raise HTTPException(404, "User not found")
    if body.username is not None: u.username = body.username
    if body.email is not None:    u.email = body.email
    db.commit(); db.refresh(u)
    return u

@app.post("/api/v1/me/password")
def set_password(body: UpdatePasswordBody, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u: raise HTTPException(404, "User not found")
    u.password_hash = body.new_password  # TODO: hash with bcrypt/passlib in prod
    db.commit()
    return {"ok": True}

@app.get("/api/v1/me/webhook-secret", response_model=WebhookSecretOut)
def get_my_secret(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u: raise HTTPException(404, "User not found")
    if not u.webhook_secret:
        u.webhook_secret = secrets.token_hex(16)
        db.commit(); db.refresh(u)
    return {"webhook_secret": u.webhook_secret}

@app.post("/api/v1/me/webhook-secret/rotate", response_model=WebhookSecretOut)
def rotate_my_secret(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u: raise HTTPException(404, "User not found")
    u.webhook_secret = secrets.token_hex(16)
    db.commit(); db.refresh(u)
    return {"webhook_secret": u.webhook_secret}
    
@app.post("/api/v1/auth/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    ident = (body.email or body.username or "").strip()
    if not ident:
        raise HTTPException(400, "email or username required")
    
    u = db.query(models.User).filter(
        or_(models.User.email == ident, models.User.username == ident)
    ).first()
    
    if not u or u.password_hash != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    payload = {"ok": True, "user": UserOut.model_validate(u, from_attributes=True).model_dump()}
    resp = JSONResponse(content=payload)
    # Session-Cookie setzen (einfach & dev-freundlich)
    resp.set_cookie(key="uid", value=str(u.id), httponly=True, samesite="lax", secure=False, path="/")
    return resp

@app.post("/api/v1/auth/logout")
def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("uid", path="/")
    return resp

@app.get("/api/v1/auth/whoami")
def whoami(user_id: int = Depends(get_current_user_id)):
    return {"user_id": user_id}

# ---------- Bots ----------


def _mask_key(k: str | None) -> str | None:
    if not k: return None
    if len(k) <= 5: return "•••"
    return f"{k[:3]}…{k[-2:]}"

def _bot_out_from_model(bot: Bot) -> BotOut:
    out = BotOut.model_validate(bot, from_attributes=True)
    # sichere Anzeige-Felder setzen
    out.has_exchange_keys = bool(bot.api_key) and bool(bot.api_secret)
    out.api_key_masked = _mask_key(bot.api_key)
    return out

@app.get("/api/v1/bots", response_model=List[BotOut])
def list_bots(include_deleted: bool = False, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    rows = crud.get_bots(db, user_id=user_id, include_deleted=include_deleted)
    return [BotOut.model_validate(x, from_attributes=True) for x in rows]

@app.get("/api/v1/bots/{bot_id}", response_model=BotOut)
def get_bot(bot_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    bot = db.query(models.Bot).filter(
        models.Bot.id == bot_id,
        models.Bot.user_id == user_id,
        models.Bot.is_deleted == False
    ).first()
    if not bot:
        raise HTTPException(404, "Bot not found or not owned by current user")
    return BotOut.model_validate(bot, from_attributes=True)

@app.post("/api/v1/bots", response_model=BotOut)
def create_bot(payload: BotCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    bot = crud.create_bot(db, user_id=user_id, data=payload)
    return BotOut.model_validate(bot, from_attributes=True)

@app.patch("/api/v1/bots/{bot_id}", response_model=BotOut)
def patch_bot(bot_id: int, payload: BotUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    bot = crud.update_bot(db, user_id=user_id, bot_id=bot_id, data=payload)
    if not bot:
        raise HTTPException(404, "Bot not found or not owned by current user")
    return BotOut.model_validate(bot, from_attributes=True)

@app.put("/api/v1/bots/{bot_id}/exchange-keys", response_model=BotOut)
def set_exchange_keys(bot_id: int, body: BotExchangeKeysIn, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    b = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.user_id == user_id, models.Bot.is_deleted == False).first()
    if not b:
        raise HTTPException(404, "Bot not found or not owned by current user")
    b.api_key = body.api_key
    b.api_secret = body.api_secret
    db.commit(); db.refresh(b)
    return _bot_out_from_model(b)

@app.get("/api/v1/bots/{bot_id}/exchange-keys", response_model=BotExchangeKeysOut)
def get_exchange_keys(bot_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    b = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.user_id == user_id, models.Bot.is_deleted == False).first()
    if not b:
        raise HTTPException(404, "Bot not found or not owned by current user")
    return BotExchangeKeysOut(api_key_masked=_mask_key(b.api_key), has_api_secret=bool(b.api_secret))

@app.delete("/api/v1/bots/{bot_id}")
def delete_bot(bot_id: int):
    with SessionLocal() as db:
        bot = db.get(models.Bot, bot_id)
        if not bot or bot.is_deleted:
            raise HTTPException(404, "Bot not found")
        # Soft delete (Frontend erwartet nur, dass der Bot verschwindet)
        bot.is_deleted = True
        if hasattr(models, "BotStatus"):
            bot.status = models.BotStatus.deleted
        if hasattr(bot, "updated_at"):
            from datetime import datetime
            bot.updated_at = datetime.utcnow()
        db.add(bot); db.commit()
        return {"ok": True}

@app.get("/api/v1/bots/{bot_id}/symbols", response_model=List[BotSymbolSettingOut])
def get_bot_symbols(bot_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    rows = crud.get_bot_symbols(db, user_id=user_id, bot_id=bot_id)
    if rows is None:
        raise HTTPException(404, "Bot not found or not owned by current user")
    return [BotSymbolSettingOut.model_validate(r, from_attributes=True) for r in rows]

@app.put("/api/v1/bots/{bot_id}/symbols", response_model=List[BotSymbolSettingOut])
def put_bot_symbols(
    bot_id: int,
    items: List[BotSymbolSettingIn],
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    rows = crud.replace_bot_symbols(db, user_id=user_id, bot_id=bot_id, items=[i.model_dump() for i in items])
    if rows is None:
        raise HTTPException(404, "Bot not found or not owned by current user")
    return [BotSymbolSettingOut.model_validate(r, from_attributes=True) for r in rows]

# ---------- Bybit Verlinkung ----------------------

@app.get("/api/v1/trades/symbols", response_model=List[str])
def trades_symbols(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    # identisch zu list_symbols – separater Alias für Frontend-Kompatibilität
    return list_symbols(db=db, user_id=user_id)

@app.post("/api/v1/bots/{bot_id}/sync-bybit")
def sync_bybit(bot_id: int, db: Session = Depends(get_db)):
    stats = sync_backfill_since(db, bot_id=bot_id, since_ms=None)
    return {"ok": True, "stats": stats}

@app.post("/api/v1/bots/{bot_id}/sync-recent-closures")
def sync_recent(bot_id: int,
                hours: int = Query(12, ge=1, le=72),
                db: Session = Depends(get_db)):
    stats = sync_recent_closures(db, bot_id=bot_id, lookback_hours=hours)
    return {"ok": True, "stats": stats}

@app.post("/api/v1/bots/{bot_id}/sync-full")
def sync_full(bot_id: int,
              days: int = Query(365, ge=1, le=730),
              db: Session = Depends(get_db)):
    stats = sync_full_history(db, bot_id=bot_id, days=days)
    return {"ok": True, "stats": stats}


@app.get("/api/v1/symbols", response_model=List[str])
def list_symbols(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    syms: set[str] = set()

    # Positions → über Bot joinen
    try:
        q_pos = (
            select(func.distinct(models.Position.symbol))
            .select_from(models.Position)
            .join(models.Bot, models.Position.bot_id == models.Bot.id)
            .where(models.Bot.user_id == user_id)
        )
        for (s,) in db.execute(q_pos).all():
            if s:
                syms.add(s)
    except Exception:
        pass

    # Executions (falls Modell existiert) → über Bot joinen
    if hasattr(models, "Execution"):
        try:
            q_exe = (
                select(func.distinct(models.Execution.symbol))
                .select_from(models.Execution)
                .join(models.Bot, models.Execution.bot_id == models.Bot.id)
                .where(models.Bot.user_id == user_id)
            )
            for (s,) in db.execute(q_exe).all():
                if s:
                    syms.add(s)
        except Exception:
            pass


    # Orders (falls Modell existiert) → über Bot joinen
    if hasattr(models, "Order"):
        try:
            q_ord = (
                select(func.distinct(models.Order.symbol))
                .select_from(models.Order)
                .join(models.Bot, models.Order.bot_id == models.Bot.id)
                .where(models.Bot.user_id == user_id)
            )
            for (s,) in db.execute(q_ord).all():
                if s:
                    syms.add(s)
        except Exception:
            pass

    return sorted(syms)

# ---------- Signalempfanglogik ----------------------
# NOCH EINZUTRAGEN



# ---------- Positions ----------

@app.get("/api/v1/positions")
def list_positions(
    status: str | None = None,
    bot_id: int | None = None,
    symbol: str | None = None,
    side: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    rows = crud.get_positions(
        db,
        user_id=user_id,
        status=status,
        bot_id=bot_id,
        symbol=symbol,
        side=side,
        skip=skip,
        limit=limit,
    )
    total = crud.count_positions(
        db,
        user_id=user_id,
        status=status,
        bot_id=bot_id,
        symbol=symbol,
        side=side,
    )

    items: list[dict] = []
    for r in rows:
        # PnL-Logik: offene Trades -> unrealized, sonst final
        pnl_value = (
            r.unrealized_pnl_usdt
            if r.status == "open" and r.unrealized_pnl_usdt is not None
            else r.pnl_usdt
        )

        # 1 einziges Entry-Feld fürs Frontend:
        entry_price = (
            r.entry_price_vwap
            or r.entry_price_best
            or r.entry_price_trigger
        )

        item = {
            "id": r.id,
            "bot_id": r.bot_id,
            "bot_name": r.bot.name if r.bot else None,
            "symbol": r.symbol,
            "side": r.side,
            "status": r.status,
            "qty": r.qty,
            "entry_price": entry_price,
            "entry_price_trigger": r.entry_price_trigger,
            "entry_price_best": r.entry_price_best,
            "entry_price_vwap": r.entry_price_vwap,
            "exit_price": r.exit_price_vwap,
            "mark_price": r.mark_price,
            "pnl": pnl_value,
            "fee_open_usdt": r.fee_open_usdt,
            "fee_close_usdt": r.fee_close_usdt,
            # falls du funding später als eigene Spalte speicherst:
            "funding_usdt": None,
            "opened_at": r.opened_at,
            "closed_at": r.closed_at,
        }
        items.append(item)

    return {
        "items": items,
        "total": total,
        "page": 1,
        "page_size": len(items),
    }


@app.get("/api/v1/positions/{position_id}")
def get_position(
    position_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    r = crud.get_position_by_id(db, user_id=user_id, position_id=position_id)
    if not r:
        raise HTTPException(status_code=404, detail="Position not found")

    pnl_value = (
        r.unrealized_pnl_usdt
        if r.status == "open" and r.unrealized_pnl_usdt is not None
        else r.pnl_usdt
    )
    entry_price = (
        r.entry_price_vwap
        or r.entry_price_best
        or r.entry_price_trigger
    )

    return {
        "id": r.id,
        "bot_id": r.bot_id,
        "bot_name": r.bot.name if r.bot else None,
        "symbol": r.symbol,
        "side": r.side,
        "status": r.status,
        "qty": r.qty,
        "entry_price": entry_price,
        "entry_price_trigger": r.entry_price_trigger,
        "entry_price_best": r.entry_price_best,
        "entry_price_vwap": r.entry_price_vwap,
        "exit_price": r.exit_price_vwap,
        "mark_price": r.mark_price,
        "pnl": pnl_value,
        "fee_open_usdt": r.fee_open_usdt,
        "fee_close_usdt": r.fee_close_usdt,
        "funding_usdt": None,
        "opened_at": r.opened_at,
        "closed_at": r.closed_at,
    }

@app.get("/api/v1/funding")
def list_funding(
    position_id: Optional[int] = Query(None),
    bot_id: Optional[int] = Query(None),
    symbol: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    q = (
        db.query(models.FundingEvent)
        .join(models.Bot, models.FundingEvent.bot_id == models.Bot.id)
        .filter(models.Bot.user_id == user_id)
    )

    if position_id is not None:
        q = q.filter(models.FundingEvent.position_id == position_id)
    if bot_id is not None:
        q = q.filter(models.FundingEvent.bot_id == bot_id)
    if symbol is not None:
        q = q.filter(models.FundingEvent.symbol == symbol)

    rows = q.order_by(models.FundingEvent.ts.desc()).limit(200).all()

    return [
        {
            "id": r.id,
            "position_id": r.position_id,
            "bot_id": r.bot_id,
            "symbol": r.symbol,
            "amount_usdt": float(r.amount_usdt or 0),
            "ts": r.ts.isoformat() if r.ts else None,
        }
        for r in rows
    ]


@app.post("/api/v1/positions/{position_id}/close")
def api_close_position(position_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    pos = (
        db.query(models.Position)
          .filter(models.Position.id == position_id)
          .filter(models.Position.user_id == user_id)
          .first()
    )
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    # zentral closen
    pos = handle_position_close(db, position_id)
    return {"ok": True, "item": pos}


# ---------- Outbox ----------
@app.get("/api/v1/outbox", response_model=List[OutboxOut])
def list_outbox(status: Optional[str] = None, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    rows = crud.get_outbox(db, user_id=user_id, status=status)
    return [OutboxOut.model_validate(x, from_attributes=True) for x in rows]

# ---------- Dashboard ----------
@app.get("/api/v1/dashboard/daily-pnl", response_model=List[DailyPnlPoint])
def get_daily_pnl(
    bot_ids: Optional[str] = None,     # optional, analog summary: "1,2,3"
    symbols: Optional[str] = None,     # optional: "BTCUSDT,ETHUSDT"
    date_from: Optional[str] = None,   # "YYYY-MM-DD" UTC
    date_to: Optional[str] = None,     # "YYYY-MM-DD" UTC (inklusive)
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Liefert eine Liste von Tages-PnL-Punkten (nur REALIZED = nur geschlossene Positionen).
    Alle Filter (Bots, Symbole, Datum) verhalten sich wie bei /dashboard/summary.
    """

    # --- Helper ---
    def parse_day(s: Optional[str]) -> Optional[date]:
        if not s:
            return None
        y, m, d = [int(x) for x in s.split("-")]
        return date(y, m, d)

    dfrom = parse_day(date_from)
    dto = parse_day(date_to)

    bot_id_list: List[int] = (
        [int(x) for x in bot_ids.split(",") if x.strip().isdigit()]
        if bot_ids else []
    )
    symbol_list: List[str] = (
        [s.strip() for s in symbols.split(",") if s.strip()]
        if symbols else []
    )

    # --- geschlossene Positionen des Users holen ---
    q = (
        db.query(models.Position)
        .join(models.Bot, models.Position.bot_id == models.Bot.id)
        .filter(models.Bot.user_id == user_id)
        .filter(models.Position.closed_at.isnot(None))
    )

    if bot_id_list:
        q = q.filter(models.Position.bot_id.in_(bot_id_list))
    if symbol_list:
        q = q.filter(models.Position.symbol.in_(symbol_list))

    rows = q.all()

    # --- pro Tag aufsummieren ---
    day_pnl = defaultdict(float)
    for p in rows:
        d = p.closed_at.date()

        # Datumsfilter anwenden (UTC)
        if dfrom and d < dfrom:
            continue
        if dto and d > dto:
            continue

        # WICHTIG: manche Positionen haben bei dir nur pnl_usdt
        pnl = float(
            getattr(p, "realized_pnl_net_usdt", None)
            or getattr(p, "pnl_usdt", 0.0)
            or 0.0
        )
        day_pnl[d] += pnl

    # --- sortieren + laufendes Equity berechnen ---
    points: List[DailyPnlPoint] = []
    running = 0.0
    for d in sorted(day_pnl.keys()):
        running += day_pnl[d]
        points.append(
            DailyPnlPoint(
                date=d.isoformat(),
                pnl=day_pnl[d],
                equity=running,
            )
        )

    return points



@app.get("/api/v1/dashboard/summary")
def dashboard_summary(
    bot_ids: Optional[str] = None,     # "1,2,3"
    symbols: Optional[str] = None,     # "BTCUSDT,ETHUSDT"
    date_from: Optional[str] = None,   # "YYYY-MM-DD" (UTC)
    date_to: Optional[str] = None,     # "YYYY-MM-DD" (UTC, inclusive)
    open_hour: Optional[str] = None,   # "HH:MM-HH:MM" (UTC)
    close_hour: Optional[str] = None,  # "HH:MM-HH:MM" (UTC)
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    # --- Helper (UTC-basiert) ---
    def parse_day(s: Optional[str]) -> Optional[date]:
        if not s:
            return None
        y, m, d = [int(x) for x in s.split("-")]
        return date(y, m, d)

    def in_day_range(dt: Optional[datetime], dfrom: Optional[date], dto: Optional[date]) -> bool:
        if not dt:
            return False  # ohne closed_at zählen wir nicht in Realized
        d = dt.date()  # dt muss UTC sein
        ok_from = (dfrom is None) or (d >= dfrom)
        ok_to = (dto is None) or (d <= dto)
        return ok_from and ok_to

    def parse_hour_range(rng: Optional[str]) -> Optional[tuple[tuple[int, int], tuple[int, int]]]:
        if not rng:
            return None
        a, b = rng.split("-")
        ah, am = [int(x) for x in a.split(":")]
        bh, bm = [int(x) for x in b.split(":")]
        return ((ah, am), (bh, bm))

    def in_hour_range(dt: Optional[datetime], rng: Optional[tuple[tuple[int, int], tuple[int, int]]]) -> bool:
        if not rng or not dt:
            return True
        (ah, am), (bh, bm) = rng
        t = (dt.hour, dt.minute)  # UTC!
        tmin = (ah, am)
        tmax = (bh, bm)
        if tmin <= tmax:  # normal
            return (t >= tmin) and (t <= tmax)
        else:  # wrap über Mitternacht
            return (t >= tmin) or (t <= tmax)

    # Filter vorbereiten
    bot_id_list: List[int] = []
    if bot_ids:
        bot_id_list = [int(x) for x in bot_ids.split(",") if x.strip().isdigit()]
    symbol_list: List[str] = []
    if symbols:
        symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]

    dfrom = parse_day(date_from)
    dto = parse_day(date_to)
    open_rng = parse_hour_range(open_hour)
    close_rng = parse_hour_range(close_hour)

    # --- Positions (nur des Users) ---
    q = (
        db.query(models.Position)
        .join(models.Bot, models.Position.bot_id == models.Bot.id)
        .filter(models.Bot.user_id == user_id)
    )
    if bot_id_list:
        q = q.filter(models.Position.bot_id.in_(bot_id_list))
    if symbol_list:
        q = q.filter(models.Position.symbol.in_(symbol_list))

    positions = q.all()

    # Heute in UTC:
    today_utc = datetime.now(timezone.utc).date()

    # Aggregatoren
    realized_today = 0.0
    wins_today = 0
    total_today = 0

    month_realized = 0.0
    month_wins = 0
    month_total = 0

    last30_realized = 0.0
    last30_wins = 0
    last30_total = 0

    open_count = 0

    equity_series = defaultdict(float)  # day -> pnl sum

    # Positions verarbeiten
    for p in positions:
        is_open = (p.closed_at is None)
        if is_open:
            open_count += 1
            continue

        closed_at = p.closed_at

        # ✨ WICHTIG: hier war dein Fehler
        pnl = float(
            getattr(p, "realized_pnl_net_usdt", None)
            or getattr(p, "pnl_usdt", 0.0)
            or 0.0
        )

        # UTC-Filter anwenden
        if not in_day_range(closed_at, dfrom, dto):
            continue
        if not in_hour_range(closed_at, open_rng):
            continue
        if not in_hour_range(closed_at, close_rng):
            continue

        d = closed_at.date()
        equity_series[d] += pnl

        # Today
        if d == today_utc:
            total_today += 1
            realized_today += pnl
            if pnl > 0:
                wins_today += 1

        # Monat (UTC)
        if d.year == today_utc.year and d.month == today_utc.month:
            month_total += 1
            month_realized += pnl
            if pnl > 0:
                month_wins += 1

        # Last 30d (UTC)
        if (today_utc - d).days <= 30:
            last30_total += 1
            last30_realized += pnl
            if pnl > 0:
                last30_wins += 1

    # --- Fees (Executions) & Funding getrennt, user-gefiltert & optional symbol/bot-gefiltert ---
    fees_total = 0.0
    funding_total = 0.0

    # Execution-Fees
    if hasattr(models, "Execution"):
        qfees = (
            db.query(models.Execution)
            .join(models.Bot, models.Execution.bot_id == models.Bot.id)
            .filter(models.Bot.user_id == user_id)
        )
        if bot_id_list:
            qfees = qfees.filter(models.Execution.bot_id.in_(bot_id_list))
        if symbol_list:
            qfees = qfees.filter(models.Execution.symbol.in_(symbol_list))
        execs = qfees.all()
        for e in execs:
            ts = getattr(e, "ts", None)
            if ts:
                if not in_day_range(ts, dfrom, dto):
                    continue
                if not in_hour_range(ts, open_rng):
                    continue
                if not in_hour_range(ts, close_rng):
                    continue
            fees_total += float(e.fee_usdt or 0.0)

    # Funding-Fees
    if hasattr(models, "FundingEvent"):
        qfund = (
            db.query(models.FundingEvent)
            .join(models.Bot, models.FundingEvent.bot_id == models.Bot.id)
            .filter(models.Bot.user_id == user_id)
        )
        if bot_id_list:
            qfund = qfund.filter(models.FundingEvent.bot_id.in_(bot_id_list))
        if symbol_list:
            qfund = qfund.filter(models.FundingEvent.symbol.in_(symbol_list))
        funds = qfund.all()
        for f in funds:
            ts = getattr(f, "ts", None)
            if ts:
                if not in_day_range(ts, dfrom, dto):
                    continue
                if not in_hour_range(ts, open_rng):
                    continue
                if not in_hour_range(ts, close_rng):
                    continue
            funding_total += float(f.amount_usdt or 0.0)

    def safe_rate(wins: int, total: int) -> float:
        return (wins / total) if total > 0 else 0.0

    tx_breakdown = {
        "fees": fees_total,
        "funding": funding_total,
        "slip_liq": 0.0,
        "slip_time": 0.0,
    }

    summary = {
        "portfolio_total_equity": sum(equity_series.values()),
        "kpis": {
            "today": {
                "realized_pnl": realized_today,
                "win_rate": safe_rate(wins_today, total_today),
                "tx_costs_pct": 0.0,
                "tx_breakdown": tx_breakdown,
                "timelag_ms": {"tv_bot_avg": 0, "bot_ex_avg": 0},
            },
            "month": {
                "realized_pnl": month_realized,
                "win_rate": safe_rate(month_wins, month_total),
                "tx_costs_pct": 0.0,
                "tx_breakdown": tx_breakdown,
                "timelag_ms": {"tv_bot_avg": 0, "bot_ex_avg": 0},
            },
            "last_30d": {
                "realized_pnl": last30_realized,
                "win_rate": safe_rate(last30_wins, last30_total),
                "tx_costs_pct": 0.0,
                "tx_breakdown": tx_breakdown,
                "timelag_ms": {"tv_bot_avg": 0, "bot_ex_avg": 0},
            },
            "current": {
                "open_trades": open_count,
                "filtered_portfolio_equity": sum(equity_series.values()),
                "win_rate": safe_rate(wins_today, total_today),
            },
        },
        "equity_timeseries": [
            {"ts": d.isoformat(), "day_pnl": equity_series[d]}
            for d in sorted(equity_series.keys())
        ],
    }
    return summary



# -------------- Symbols / Pairs -----------------------

@app.post("/api/v1/symbols/sync")
def symbols_sync(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    """
    Synchronisiert alle USDT-Perp-Symbole von Bybit in die DB.
    Auth ist hier nur dafür, dass der Aufruf vom eingeloggten User kommt;
    Market-Endpunkt ist public und benötigt keine API-Keys.
    """
    # Falls du zwingend über deinen v5-Client gehen willst:
    bybit_client = None
    # Beispiel: nimm (optional) Keys vom ersten Bot des Users, wenn dein Client zwingend signiert:
    # bot = db.execute(select(models.Bot).where(models.Bot.user_id == user_id, models.Bot.is_deleted == False)).scalar_one_or_none()
    # if bot and bot.api_key and bot.api_secret:
    #     from .bybit_v5 import BybitV5Client
    #     bybit_client = BybitV5Client(bot.api_key, bot.api_secret)
    count = sync_symbols_linear_usdt(db, bybit_client)
    return {"ok": True, "updated": count}


def icon_candidates_for(base: str) -> list[str]:
    b = (base or "").lower()
    if not b:
        return []
    return [
        # 1) CoinCap (PNG, häufig vorhanden)
        f"https://assets.coincap.io/assets/icons/{b}@2x.png",
        # 2) Cryptoicons (SVG/PNG API)
        f"https://cryptoicons.org/api/icon/{b}/64",
        # 3) GitHub Repo (SVG Farbig)
        f"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/{b}.svg",
        # 4) GitHub Repo (SVG Monochrom)
        f"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/black/{b}.svg",
    ]

@app.get("/api/v1/pairs")
def list_pairs():
    with SessionLocal() as db:
        rows = db.query(models.Symbol).all()
        out = []
        for r in rows:
            out.append(SymbolOut(
                symbol=r.symbol,
                tick_size=r.tick_size,
                step_size=r.step_size,
                base_currency=r.base_currency,
                quote_currency=r.quote_currency,
                max_leverage=r.max_leverage,
                icon_candidates=icon_candidates_for(r.base_currency),
            ))
        return out

@app.get("/api/v1/symbols/all", response_model=List[str])
def list_all_symbols(db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    rows = db.execute(select(models.Symbol.symbol).order_by(models.Symbol.symbol.asc())).all()
    return [s for (s,) in rows]



# ----------- debug -------------------------


@app.post("/api/v1/bots/{bot_id}/sync-bybit-quick")
def sync_bybit_quick(bot_id: int,
                     symbol: str = Query("ETHUSDT"),
                     days: int = Query(5, ge=1, le=7),
                     db: Session = Depends(get_db)):
    stats = quick_sync_symbol(db, bot_id=bot_id, symbol=symbol, days=days)
    return {"ok": True, "stats": stats}


from datetime import timedelta

@app.get("/api/v1/debug/bybit")
def debug_bybit(
    bot_id: int,
    symbol: str = "BTCUSDT",
    days: int = 5,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    # Bot + Keys
    bot = (
        db.query(models.Bot)
        .filter(models.Bot.id == bot_id, models.Bot.user_id == user_id, models.Bot.is_deleted == False)
        .first()
    )
    if not bot:
        raise HTTPException(404, "No bot (with API keys) found for user")
    api_key = (bot.api_key or "").strip()
    api_secret = (bot.api_secret or "").strip()
    if not api_key or not api_secret:
        raise HTTPException(400, "Bot has no API key/secret stored")

    # Zeitfenster
    end_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = int((datetime.now(timezone.utc) - timedelta(days=max(1, days))).timestamp() * 1000)

    # Symbol normalisieren (linear braucht volle Paare)
    symbol = (symbol or "").upper().strip()
    if symbol and not symbol.endswith(("USDT", "USDC")):
        if symbol in ("BTC","ETH","XRP","SOL","BNB","DOGE","ADA","LTC","XLM","LINK","AVAX","TRX"):
            symbol = symbol + "USDT"

    # Bybit Client (Data-Wrap)
    from .bybit_v5_data import BybitV5Data
    data = BybitV5Data(api_key, api_secret)

    # 1) instruments-info (linear)
    try:
        instr_raw = data.instruments_info(category="linear", symbol=symbol)
    except Exception as e:
        instr_raw = {"_error": str(e)}

    # 2) executions (linear) – korrekte Param-Namen startTime/endTime
    try:
        exec_raw = data.executions(
            category="linear",
            symbol=symbol,
            startTime=start_ms,
            endTime=end_ms,
            limit=200,      # Bybit erlaubt hier 200
        )
    except Exception as e:
        exec_raw = {"_error": str(e)}

    # 3) closed-pnl (linear)
    try:
        closed_raw = data.closed_pnl(
            category="linear",
            symbol=symbol,
            startTime=start_ms,
            endTime=end_ms,
            limit=200,
        )
    except Exception as e:
        closed_raw = {"_error": str(e)}

    # 4) funding (transaction-log; Account/Category filtern; limit 50 + Pagination)
    try:
        funding_pages = []
        cursor = None
        for _ in range(5):  # bis 5 Seiten à 50 = 250 Items
            fund_page = data.transaction_log(
                accountType="UNIFIED",
                category="linear",   # auf Derivate eingrenzen
                currency="USDT",     # nur USDT-Änderungen (optional)
                startTime=start_ms,
                endTime=end_ms,
                limit=50,
                cursor=cursor,
            )
            funding_pages.append(fund_page)
            cursor = (fund_page.get("result") or {}).get("nextPageCursor")
            if not cursor:
                break
        # Für die Ausgabe eine "synthetische" Seite mit zusammengefasster Liste bauen
        combined_list = []
        last_cursor = None
        for p in funding_pages:
            res = p.get("result") or {}
            lst = res.get("list") or []
            combined_list.extend(lst)
            last_cursor = res.get("nextPageCursor") or last_cursor
        funding_raw = {
            "retCode": 0,
            "retMsg": "OK",
            "result": {"list": combined_list, "nextPageCursor": last_cursor or ""},
        }
    except Exception as e:
        funding_raw = {"_error": str(e)}

    # Helper – kompakte Zusammenfassung
    def summarize(name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            return {"name": name, "note": "not a dict"}
        ret = {"name": name, "retCode": payload.get("retCode"), "retMsg": payload.get("retMsg")}
        result = payload.get("result")
        if isinstance(result, dict):
            lst = result.get("list")
            ret["list_len"] = len(lst) if isinstance(lst, list) else 0
            ret["first_item"] = lst[0] if isinstance(lst, list) and lst else None
            if "nextPageCursor" in result:
                ret["has_cursor"] = bool(result.get("nextPageCursor"))
        if "_error" in payload:
            ret["_error"] = payload["_error"]
        return ret

    return {
        "window": {"start_ms": start_ms, "end_ms": end_ms},
        "symbol": symbol,
        "instruments_info": summarize("instruments_info", instr_raw),
        "executions": summarize("executions", exec_raw),
        "closed_pnl": summarize("closed_pnl", closed_raw),
        "funding": summarize("funding", funding_raw),
        "raw": {
            "executions": exec_raw,
            "closed_pnl": closed_raw,
            "funding": funding_raw,
        },
    }


# ------------------ Bybit - TV Signal Intake -------------------------
from pydantic import BaseModel
import time, json
from .models import User, Bot, BotSymbolSetting, Symbol, OutboxItem

class TvSignal(BaseModel):
    bot_uuid: str
    user_secret: str
    symbol: str
    direction: str
    entry_price: float | None = None
    stopLoss: float
    takeProfit: float
    tv_qty: float
    tv_risk_amount: float
    rrr: float | None = None
    tv_ts: float | None = None

def _round_to_step(x: float, step: float) -> float:
    if step <= 0: return x
    return round(x / step) * step

def _round_to_tick(x: float, tick: float) -> float:
    if tick <= 0: return x
    return round(x / tick) * tick

@app.post("/api/v1/tv/signal")
def ingest_tv_signal(sig: TvSignal, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or not u.webhook_secret or sig.user_secret != u.webhook_secret:
        raise HTTPException(403, "invalid user_secret")

    bot = db.execute(select(Bot).where(Bot.uuid == sig.bot_uuid, Bot.user_id == user_id)).scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "bot not found")
    bss = db.execute(select(BotSymbolSetting).where(BotSymbolSetting.bot_id == bot.id, BotSymbolSetting.symbol == sig.symbol, BotSymbolSetting.enabled == True)).scalar_one_or_none()
    if not bss:
        raise HTTPException(400, "symbol not enabled for this bot")

    sym = db.execute(select(Symbol).where(Symbol.symbol == sig.symbol)).scalar_one_or_none()
    if not sym:
        raise HTTPException(400, "unknown symbol")

    if sig.tv_risk_amount <= 0 or sig.tv_qty <= 0:
        raise HTTPException(400, "tv_risk_amount and tv_qty must be > 0")

    risk_amount = float(bss.risk_amount_usdt)
    qty = risk_amount / float(sig.tv_risk_amount) * float(sig.tv_qty)
    qty = max(_round_to_step(qty, sym.step_size), sym.step_size)

    sl_trigger = _round_to_tick(sig.stopLoss, sym.tick_size)
    tp_trigger = _round_to_tick(sig.takeProfit, sym.tick_size)
    off_mkt = 0.00015
    off_lim = 0.00030

    if sig.direction.lower() == "long":
        side_entry = "Buy"; side_exit = "Sell"; trig_dir = 2
        sl_market = _round_to_tick(sl_trigger * (1 - off_mkt), sym.tick_size)
        sl_limit  = _round_to_tick(sl_trigger * (1 - off_lim), sym.tick_size)
    else:
        side_entry = "Sell"; side_exit = "Buy"; trig_dir = 1
        sl_market = _round_to_tick(sl_trigger * (1 + off_mkt), sym.tick_size)
        sl_limit  = _round_to_tick(sl_trigger * (1 + off_lim), sym.tick_size)

    nowms = int(time.time()*1000)

    entry_payload = {
        "category": "linear",
        "symbol": sig.symbol,
        "side": side_entry,
        "orderType": "Market",
        "qty": f"{qty}",
        "positionIdx": 0,
        "orderLinkId": f"entry-{sig.symbol}-{nowms}",
        "tpslMode": "Full",
        "takeProfit": f"{tp_trigger}",
        "tpOrderType": "Market",
        "tpTriggerBy": "LastPrice",
        "stopLoss": f"{sl_market}",
        "slOrderType": "Market",
        "slTriggerBy": "LastPrice"
    }

    sl_limit_payload = {
        "category": "linear",
        "symbol": sig.symbol,
        "side": side_exit,
        "orderType": "Limit",
        "price": f"{sl_limit}",
        "qty": f"{qty}",
        "timeInForce": "GTC",
        "reduceOnly": True,
        "closeOnTrigger": True,
        "triggerPrice": f"{sl_trigger}",
        "triggerBy": "LastPrice",
        "triggerDirection": trig_dir,
        "orderLinkId": f"slsl-{sig.symbol}-{nowms}",
        "positionIdx": 0
    }

    ob = OutboxItem(
        user_id=user_id,
        bot_id=bot.id,
        symbol=sig.symbol,
        payload_entry=json.dumps(entry_payload),
        payload_sl_limit=json.dumps(sl_limit_payload),
        status=("sent" if bot.auto_approve else "pending_approval")
    )
    db.add(ob); db.commit(); db.refresh(ob)

    if bot.auto_approve:
        _send_outbox(ob, bot, user_id, db)

    return {"ok": True, "outbox_id": ob.id, "status": ob.status, "entry": entry_payload, "sl_limit": sl_limit_payload}

@app.post("/api/v1/outbox/{outbox_id}/approve")
def approve_outbox(outbox_id: int, user: User = Depends(get_current_user_id), db: Session = Depends(get_db)):
    from .models import OutboxItem, Bot
    user_id: int = Depends(get_current_user_id),
    ob = db.get(OutboxItem, outbox_id)
    if not ob or ob.user_id != user_id:
        raise HTTPException(404, "outbox not found")
    bot = db.get(Bot, ob.bot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(404, "bot not found")
    if ob.status != "pending_approval":
        return {"ok": True, "status": ob.status}
    _send_outbox(ob, bot, user, db)
    return {"ok": True, "status": ob.status}

def _decrypt_secret(enc: str) -> str:
    return enc or ""

def _send_outbox(ob, bot, user, db: Session):
    from .bybit_v5 import BybitRest
    rest = BybitRest(os.getenv("BYBIT_REST_URL", "https://api.bybit.com"))
    api_key = bot.api_key or ""
    api_secret = bot.api_secret
    try:
        entry = json.loads(ob.payload_entry); rest.place_order(api_key, api_secret, entry)
        sll  = json.loads(ob.payload_sl_limit); rest.place_order(api_key, api_secret, sll)
        from datetime import datetime as _dt
        ob.status = "sent"; ob.sent_at = _dt.utcnow(); db.commit()
    except Exception as ex:
        ob.status = "error"; ob.error = str(ex); db.commit()

ws_threads = {}

def _on_exec(row, ctx):
    db = SessionLocal()
    try:
        from .models import Execution
        from datetime import datetime as dt
        bot_id = ctx["bot_id"]
        symbol = row.get("symbol") or row.get("s") or ""
        side_raw = row.get("side") or row.get("S") or ""
        side = side_raw.lower() if isinstance(side_raw, str) else ""
        price = float(row.get("execPrice") or row.get("p") or 0.0)
        qty   = float(row.get("execQty") or row.get("q") or 0.0)
        fee   = float(row.get("execFee") or row.get("fe") or 0.0)
        is_maker = bool(row.get("isMaker", False))
        reduce_only = bool(row.get("reduceOnly", False))
        ts_ms = int(row.get("execTime") or row.get("T") or 0)
        if ts_ms <= 0:
            import time as _t; ts_ms = int(_t.time()*1000)
        ts = dt.utcfromtimestamp(ts_ms/1000.0)
        ex = Execution(
            bot_id=bot_id, symbol=symbol, side=side,
            price=price, qty=qty, fee_usdt=fee, is_maker=is_maker, reduce_only=reduce_only, ts=ts
        )
        db.add(ex); db.commit()
        from .services.bybit_sync import rebuild_positions
        rebuild_positions(db, bot_id=bot_id)
    finally:
        db.close()

def _on_position(row: dict, ctx: dict):
    """
    Wird von BybitWS aufgerufen, wenn sich eine Position ändert.
    Wir cachen nur das, was wir für offene Trades im Frontend brauchen.
    """
    bot_id = ctx.get("bot_id")
    symbol = row.get("symbol") or row.get("s")
    if not bot_id or not symbol:
        return

    # Bybit WS liefert Strings
    size = float(row.get("size") or 0.0)
    avg_price = float(row.get("avgPrice") or 0.0)
    mark_price = float(row.get("markPrice") or 0.0)
    unreal = float(row.get("unrealisedPnl") or 0.0)

    position_cache[(bot_id, symbol)] = {
        "size": size,
        "avg_price": avg_price,
        "mark_price": mark_price,
        "unrealised_pnl": unreal,
        "ts": time.time(),
    }

def _start_ws_for_bot(bot):
    if not bot.is_active: return
    if bot.id in ws_threads: return
    from .bybit_v5 import BybitWS
    api_key = bot.api_key or ""
    api_secret = (bot.api_secret or "")
    ctx = {"user_id": bot.user_id, "bot_id": bot.id}
    ws = BybitWS(os.getenv("BYBIT_WS_URL", "wss://stream.bybit.com/v5/private"), api_key, api_secret, _on_exec, _on_position, ctx)
    ws.start(); ws_threads[bot.id] = ws

def _stop_ws_for_bot(bot_id: int):
    ws = ws_threads.pop(bot_id, None)
    if ws: ws.stop()

def task_start_ws_for_active_bots():
    db = SessionLocal()
    try:
        from .models import Bot
        bots = db.execute(select(Bot).where(Bot.is_active == True)).scalars().all()
        for b in bots: _start_ws_for_bot(b)
    finally:
        db.close()

def task_rebuild_all_bots():
    with SessionLocal() as db:
        bots = db.execute(select(Bot)).scalars().all()
        for b in bots:
            rebuild_positions(db, bot_id=b.id)


@app.on_event("startup")
def _on_startup():
    import threading
    threading.Thread(target=task_start_ws_for_active_bots, daemon=True).start()
    threading.Thread(target=task_rebuild_all_bots, daemon=True).start()


# ============================================================
# Funktion um alle Bots über 13h automatisch zu syncen und sonst eigener Router
# ============================================================   
@app.post("/api/v1/bots/{bot_id}/sync-symbol")
def sync_symbol_for_bot(
    bot_id: int,
    symbol: str,
    hours: int = 2,
    db: Session = Depends(get_db),
):
    stats = sync_symbol_recent(db, bot_id=bot_id, symbol=symbol, hours=hours)
    return {"ok": True, "stats": stats}


@app.post("/api/v1/sync/bybit/recent-all")
def sync_all_bots_recent(
    hours: int = 13,
    db: Session = Depends(get_db),
):
    stats = sync_recent_all_bots(db, lookback_hours=hours)
    return {"ok": True, "stats": stats}
