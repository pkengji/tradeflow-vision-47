
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from .models import User, Bot, Position, Outbox, DailyPnl, BotSymbolSetting
from .schemas import BotCreate, BotUpdate
from uuid import uuid4

from sqlalchemy import func
from . import models

# -------- Bots --------
def get_bots(db: Session, user_id: int, include_deleted: bool = False):
    q = db.query(Bot).filter(Bot.user_id == user_id)
    if not include_deleted:
        q = q.filter(Bot.is_deleted == False)
    return q.order_by(Bot.id.desc()).all()

def create_bot(db: Session, user_id: int, data: BotCreate) -> Bot:
    bot = Bot(
        user_id=user_id,
        name=data.name.strip() if data.name else "Bot",
        #description=data.description,
        uuid=str(uuid4()),
        #exchange=data.exchange or "bybit",
        #strategy=data.strategy,
        #timeframe=data.timeframe,
        status="active",
        auto_approve=bool(data.auto_approve),
        position_mode="one_way",
        margin_mode="isolated",
        default_leverage=10.0,
        tv_risk_multiplier_default=1.0,
        is_active=True,
        is_deleted=False,
        api_key=data.api_key, 
        api_secret=data.api_secret
        
    )
    db.add(bot); db.commit(); db.refresh(bot)
    return bot


def update_bot(db: Session, user_id: int, bot_id: int, data: BotUpdate) -> Bot | None:
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == user_id, Bot.is_deleted == False).first()
    if not bot: 
        return None
    # Felder optional updaten
    for field in ["name","description","exchange","strategy","timeframe","auto_approve"]:
        val = getattr(data, field)
        if val is not None:
            setattr(bot, field, val)
    if data.api_key is not None:
        bot.api_key = data.api_key
    if data.api_secret is not None:
        bot.api_secret = data.api_secret
    bot.updated_at = datetime.utcnow()
    db.commit(); db.refresh(bot)
    return bot

def set_bot_exchange_keys(db: Session, user_id: int, bot_id: int, api_key: str, api_secret: str) -> Bot:
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == user_id, Bot.is_deleted == False).first()
    if not bot:
        return None
    bot.api_key = api_key
    bot.api_secret = api_secret
    bot.updated_at = datetime.utcnow()
    db.commit(); db.refresh(bot)
    return bot

def get_bot_symbols(db: Session, user_id: int, bot_id: int):
    # Ownership absichern via Join über Bot
    return (
        db.query(BotSymbolSetting)
        .join(Bot, BotSymbolSetting.bot_id == Bot.id)
        .filter(Bot.id == bot_id, Bot.user_id == user_id, Bot.is_deleted == False)
        .order_by(BotSymbolSetting.symbol.asc())
        .all()
    )

def replace_bot_symbols(db: Session, user_id: int, bot_id: int, items: list[dict]):
    # einfache Strategie: existierende Einträge löschen und neu schreiben
    exists = db.query(Bot).filter(Bot.id == bot_id, Bot.user_id == user_id, Bot.is_deleted == False).first()
    if not exists:
        return None

    db.query(BotSymbolSetting).filter(BotSymbolSetting.bot_id == bot_id).delete()

    rows = []
    for it in items:
        row = BotSymbolSetting(
            bot_id=bot_id,
            symbol=it.get("symbol", "").upper(),
            enabled=bool(it.get("enabled", True)),
            target_risk_amount=float(it.get("target_risk_amount", 1.0)),
            leverage_override=it.get("leverage_override", None),
        )
        db.add(row)
        rows.append(row)

    db.commit()
    for r in rows:
        db.refresh(r)
    return rows

# -------- Positions --------
def get_positions(
    db,
    *,
    user_id: int,
    status: str | None = None,
    bot_id: int | None = None,
    symbol: str | None = None,
    side: str | None = None,
    skip: int = 0,
    limit: int = 100,
):
    """
    Holt Positionen eines Users.
    KEIN unnötiger Join auf Executions -> sonst Duplikate.
    """
    q = (
        db.query(models.Position)
        .join(models.Bot, models.Position.bot_id == models.Bot.id)
        .filter(models.Bot.user_id == user_id)
    )

    if status:
        q = q.filter(models.Position.status == status)
    if bot_id:
        q = q.filter(models.Position.bot_id == bot_id)
    if symbol:
        q = q.filter(models.Position.symbol == symbol)
    if side:
        q = q.filter(models.Position.side == side)

    # Sortierung abhängig vom Status
    if status == 'closed':
        q = q.order_by(
            models.Position.closed_at.desc().nullslast(),
            models.Position.id.desc(),
        )
    else:
        q = q.order_by(
            models.Position.opened_at.desc().nullslast(),
            models.Position.id.desc(),
        )

    return q.offset(skip).limit(limit).all()


def count_positions(
    db,
    *,
    user_id: int,
    status: str | None = None,
    bot_id: int | None = None,
    symbol: str | None = None,
    side: str | None = None,
) -> int:
    q = (
        db.query(func.count(models.Position.id))
        .join(models.Bot, models.Position.bot_id == models.Bot.id)
        .filter(models.Bot.user_id == user_id)
    )

    if status:
        q = q.filter(models.Position.status == status)
    if bot_id:
        q = q.filter(models.Position.bot_id == bot_id)
    if symbol:
        q = q.filter(models.Position.symbol == symbol)
    if side:
        q = q.filter(models.Position.side == side)

    return q.scalar() or 0


def get_position_by_id(
    db,
    *,
    user_id: int,
    position_id: int,
):
    """
    Einzelnen Trade holen (für Detail-Panel).
    """
    return (
        db.query(models.Position)
        .join(models.Bot, models.Position.bot_id == models.Bot.id)
        .filter(
            models.Bot.user_id == user_id,
            models.Position.id == position_id,
        )
        .first()
    )


# -------- Outbox --------
def get_outbox(db: Session, user_id: int, status=None):
    q = db.query(Outbox).join(Bot, Outbox.bot_id == Bot.id).filter(Bot.user_id == user_id)
    if status:
        q = q.filter(Outbox.status == status)
    return q.order_by(Outbox.id.desc()).all()

# -------- Daily PnL --------
def get_daily_pnl(db: Session, user_id: int, bot_id=None, days=30):
    since = (datetime.utcnow() - timedelta(days=days-1)).strftime("%Y-%m-%d")
    q = (
        db.query(DailyPnl)
        .join(Bot, DailyPnl.bot_id == Bot.id)
        .filter(Bot.user_id == user_id, DailyPnl.date >= since)
    )
    if bot_id:
        q = q.filter(DailyPnl.bot_id == bot_id)
    return q.order_by(DailyPnl.date.asc()).all()
