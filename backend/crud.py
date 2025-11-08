from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
import json

from models import (
    Bot, BotSymbolSetting, Position, Order, Execution, 
    FundingRecord, Symbol, Outbox, SignalLog, User, 
    UserSettings, DailyPnL, BotStatus, PositionStatus
)
from schemas import BotCreate, BotUpdate, SetSlTpRequest

# Bot CRUD
def get_bots(db: Session, include_deleted: bool = False) -> List[Bot]:
    query = db.query(Bot)
    if not include_deleted:
        query = query.filter(Bot.is_deleted == False)
    return query.all()

def get_bot(db: Session, bot_id: int) -> Optional[Bot]:
    return db.query(Bot).filter(Bot.id == bot_id).first()

def create_bot(db: Session, bot: BotCreate) -> Bot:
    db_bot = Bot(**bot.dict())
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot

def update_bot(db: Session, bot_id: int, bot_update: BotUpdate) -> Optional[Bot]:
    db_bot = get_bot(db, bot_id)
    if not db_bot:
        return None
    
    for key, value in bot_update.dict(exclude_unset=True).items():
        setattr(db_bot, key, value)
    
    db_bot.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_bot)
    return db_bot

def delete_bot(db: Session, bot_id: int) -> bool:
    db_bot = get_bot(db, bot_id)
    if not db_bot:
        return False
    db_bot.is_deleted = True
    db_bot.status = BotStatus.deleted
    db.commit()
    return True

def pause_bot(db: Session, bot_id: int) -> Optional[Bot]:
    db_bot = get_bot(db, bot_id)
    if not db_bot:
        return None
    db_bot.status = BotStatus.paused
    db_bot.is_active = False
    db.commit()
    db.refresh(db_bot)
    return db_bot

def resume_bot(db: Session, bot_id: int) -> Optional[Bot]:
    db_bot = get_bot(db, bot_id)
    if not db_bot:
        return None
    db_bot.status = BotStatus.active
    db_bot.is_active = True
    db.commit()
    db.refresh(db_bot)
    return db_bot

def set_auto_approve(db: Session, bot_id: int, auto_approve: bool) -> Optional[Bot]:
    db_bot = get_bot(db, bot_id)
    if not db_bot:
        return None
    db_bot.auto_approve = auto_approve
    db.commit()
    db.refresh(db_bot)
    return db_bot

# Position CRUD
def get_positions(
    db: Session,
    status: Optional[str] = None,
    bot_id: Optional[int] = None,
    symbol: Optional[str] = None,
    side: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[Position]:
    query = db.query(Position)
    
    if status:
        query = query.filter(Position.status == status)
    if bot_id:
        query = query.filter(Position.bot_id == bot_id)
    if symbol:
        query = query.filter(Position.symbol == symbol)
    if side:
        query = query.filter(Position.side == side)
    
    return query.offset(skip).limit(limit).all()

def get_position(db: Session, position_id: int) -> Optional[Position]:
    return db.query(Position).filter(Position.id == position_id).first()

def set_position_sl_tp(db: Session, position_id: int, sl_tp: SetSlTpRequest) -> Optional[Position]:
    position = get_position(db, position_id)
    if not position:
        return None
    
    if sl_tp.sl is not None:
        position.sl = sl_tp.sl
    if sl_tp.tp is not None:
        position.tp = sl_tp.tp
    
    db.commit()
    db.refresh(position)
    return position

def close_position(db: Session, position_id: int) -> Optional[Position]:
    position = get_position(db, position_id)
    if not position:
        return None
    
    position.status = PositionStatus.closed
    position.closed_at = datetime.utcnow()
    
    # Calculate PnL (simplified)
    if position.current_price and position.entry_fill_price:
        if position.side == "long":
            pnl_pct = ((position.current_price - position.entry_fill_price) / position.entry_fill_price) * 100
        else:
            pnl_pct = ((position.entry_fill_price - position.current_price) / position.entry_fill_price) * 100
        
        position.pnl_pct = pnl_pct
        position.pnl = (pnl_pct / 100) * (position.qty * position.entry_fill_price)
    
    db.commit()
    db.refresh(position)
    return position

# Order CRUD
def get_orders_by_position(db: Session, position_id: int) -> List[Order]:
    return db.query(Order).filter(Order.position_id == position_id).all()

# Funding CRUD
def get_funding_by_position(db: Session, position_id: int) -> List[FundingRecord]:
    return db.query(FundingRecord).filter(FundingRecord.position_id == position_id).all()

# Symbol CRUD
def get_symbols(db: Session) -> List[Symbol]:
    return db.query(Symbol).all()

# Outbox CRUD
def get_outbox(db: Session, status: Optional[str] = None) -> List[Outbox]:
    query = db.query(Outbox)
    if status:
        query = query.filter(Outbox.status == status)
    return query.all()

def approve_outbox(db: Session, outbox_id: int) -> Optional[Outbox]:
    outbox = db.query(Outbox).filter(Outbox.id == outbox_id).first()
    if not outbox:
        return None
    outbox.status = "approved"
    outbox.processed_at = datetime.utcnow()
    db.commit()
    db.refresh(outbox)
    return outbox

def reject_outbox(db: Session, outbox_id: int) -> Optional[Outbox]:
    outbox = db.query(Outbox).filter(Outbox.id == outbox_id).first()
    if not outbox:
        return None
    outbox.status = "rejected"
    outbox.processed_at = datetime.utcnow()
    db.commit()
    db.refresh(outbox)
    return outbox

def get_outbox_preview(db: Session, outbox_id: int) -> Optional[dict]:
    outbox = db.query(Outbox).filter(Outbox.id == outbox_id).first()
    if not outbox:
        return None
    
    return {
        "id": outbox.id,
        "action": outbox.action,
        "symbol": outbox.symbol,
        "side": outbox.side,
        "payload": json.loads(outbox.payload) if outbox.payload else {},
        "created_at": outbox.created_at.isoformat()
    }

# Dashboard CRUD
def get_daily_pnl(db: Session, bot_id: Optional[int] = None, days: int = 30) -> List[DailyPnL]:
    query = db.query(DailyPnL)
    if bot_id:
        query = query.filter(DailyPnL.bot_id == bot_id)
    
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    query = query.filter(DailyPnL.date >= start_date)
    
    return query.order_by(DailyPnL.date).all()

# User Settings CRUD
def get_user_settings(db: Session, user_id: int) -> Optional[UserSettings]:
    return db.query(UserSettings).filter(UserSettings.user_id == user_id).first()

def update_user_timezone(db: Session, user_id: int, timezone: str, use_system: bool) -> UserSettings:
    settings = get_user_settings(db, user_id)
    if not settings:
        settings = UserSettings(user_id=user_id, timezone=timezone, use_system_timezone=use_system)
        db.add(settings)
    else:
        settings.timezone = timezone
        settings.use_system_timezone = use_system
    
    db.commit()
    db.refresh(settings)
    return settings

def get_notification_settings(db: Session, user_id: int) -> dict:
    settings = get_user_settings(db, user_id)
    if not settings or not settings.notification_settings:
        return {}
    return json.loads(settings.notification_settings)

def update_notification_settings(db: Session, user_id: int, notification_settings: dict) -> UserSettings:
    settings = get_user_settings(db, user_id)
    if not settings:
        settings = UserSettings(
            user_id=user_id,
            notification_settings=json.dumps(notification_settings)
        )
        db.add(settings)
    else:
        settings.notification_settings = json.dumps(notification_settings)
    
    db.commit()
    db.refresh(settings)
    return settings

def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()

def update_user_profile(db: Session, user_id: int, name: str) -> Optional[User]:
    user = get_user(db, user_id)
    if not user:
        return None
    user.name = name
    db.commit()
    db.refresh(user)
    return user

def update_user_password(db: Session, user_id: int, new_password_hash: str) -> Optional[User]:
    user = get_user(db, user_id)
    if not user:
        return None
    user.password_hash = new_password_hash
    db.commit()
    db.refresh(user)
    return user

def get_kpi_data(db: Session, bot_id: Optional[int] = None) -> dict:
    query = db.query(Position)
    
    if bot_id:
        query = query.filter(Position.bot_id == bot_id)
    
    positions = query.all()
    closed_positions = [p for p in positions if p.status == PositionStatus.closed]
    
    total_pnl = sum(p.pnl or 0 for p in closed_positions)
    winning_trades = len([p for p in closed_positions if (p.pnl or 0) > 0])
    total_closed = len(closed_positions)
    win_rate = (winning_trades / total_closed * 100) if total_closed > 0 else 0
    
    avg_fees = sum(p.trading_fees or 0 for p in closed_positions) / total_closed if total_closed > 0 else 0
    funding_fees = sum(p.funding_fees or 0 for p in positions)
    avg_timelag = sum(p.timelag_ms or 0 for p in positions) / len(positions) if positions else 0
    
    return {
        "pnlTotal": round(total_pnl, 2),
        "winRate": round(win_rate, 2),
        "tradesCount": len(positions),
        "avgFees": round(avg_fees, 2),
        "fundingFees": round(funding_fees, 2),
        "avgTimelag": round(avg_timelag, 2)
    }

def get_bot_symbol_settings(db: Session, bot_id: int) -> List[BotSymbolSetting]:
    return db.query(BotSymbolSetting).filter(BotSymbolSetting.bot_id == bot_id).all()
