from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import json
from datetime import datetime, timedelta
import random

from database import engine, get_db, Base
from models import (
    Bot, Position, Symbol, User, UserSettings, 
    DailyPnL, BotSymbolSetting, Order, FundingRecord,
    Outbox, PositionStatus, BotStatus
)
from schemas import (
    BotCreate, BotUpdate, BotResponse, PositionResponse,
    SetSlTpRequest, UserCreate, UserResponse, UserProfileUpdate,
    UserPasswordUpdate, TimezoneUpdate, NotificationSettings,
    NotificationSettingsUpdate, SymbolResponse, OrderResponse,
    FundingResponse, DailyPnLPoint, OutboxResponse, BotSymbolSettingResponse
)
import crud
import auth

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TradingBot API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database with sample data
def init_sample_data(db: Session):
    # Check if data already exists
    if db.query(User).first():
        return
    
    print("Initializing sample data...")
    
    # Create test owner user
    test_user = auth.create_user(
        db=db,
        username="test",
        email="test@gmail.com",
        password="test",
        name="Test Owner",
        role="owner"
    )
    
    # Create user settings
    user_settings = UserSettings(
        user_id=test_user.id,
        timezone="Europe/Berlin",
        use_system_timezone=True,
        notification_settings=json.dumps({
            "position_opened": {"email": True, "push": False},
            "position_closed": {"email": True, "push": True},
            "sl_hit": {"email": True, "push": True},
            "tp_hit": {"email": True, "push": True},
            "bot_error": {"email": True, "push": False},
            "outbox_pending": {"email": False, "push": False}
        })
    )
    db.add(user_settings)
    
    # Create symbols
    symbols_data = [
        {"symbol": "BTCUSDT", "tick_size": 0.01, "step_size": 0.001},
        {"symbol": "ETHUSDT", "tick_size": 0.01, "step_size": 0.001},
        {"symbol": "SOLUSDT", "tick_size": 0.01, "step_size": 0.01},
        {"symbol": "BNBUSDT", "tick_size": 0.01, "step_size": 0.001},
        {"symbol": "ADAUSDT", "tick_size": 0.0001, "step_size": 1.0},
    ]
    
    for sym_data in symbols_data:
        symbol = Symbol(**sym_data)
        db.add(symbol)
    
    # Create bots
    bots_data = [
        {
            "name": "BTC Scalper",
            "description": "High frequency Bitcoin scalping strategy",
            "exchange": "bybit",
            "strategy": "Scalping",
            "timeframe": "5m",
            "status": BotStatus.active,
            "auto_approve": True,
            "default_leverage": 10
        },
        {
            "name": "ETH Swing Trader",
            "description": "Ethereum swing trading on 4h timeframe",
            "exchange": "bybit",
            "strategy": "Swing",
            "timeframe": "4h",
            "status": BotStatus.active,
            "auto_approve": False,
            "default_leverage": 5
        },
        {
            "name": "SOL Momentum",
            "description": "Solana momentum strategy",
            "exchange": "bybit",
            "strategy": "Momentum",
            "timeframe": "1h",
            "status": BotStatus.paused,
            "auto_approve": True,
            "default_leverage": 8
        }
    ]
    
    created_bots = []
    for bot_data in bots_data:
        bot = Bot(**bot_data)
        db.add(bot)
        db.flush()
        created_bots.append(bot)
    
    # Create sample positions
    base_date = datetime.utcnow() - timedelta(days=7)
    
    positions_data = [
        {
            "bot_id": created_bots[0].id,
            "symbol": "BTCUSDT",
            "side": "long",
            "qty": 0.5,
            "leverage": 10,
            "entry_signal_price": 42000,
            "entry_fill_price": 42050,
            "current_price": 43000,
            "tp": 44000,
            "sl": 41000,
            "status": PositionStatus.open,
            "opened_at": base_date,
            "pnl": 475,
            "pnl_pct": 2.26,
            "trading_fees": 12.6,
            "funding_fees": -3.2
        },
        {
            "bot_id": created_bots[0].id,
            "symbol": "BTCUSDT",
            "side": "short",
            "qty": 0.3,
            "leverage": 10,
            "entry_signal_price": 43500,
            "entry_fill_price": 43450,
            "current_price": 43000,
            "tp": 42000,
            "sl": 44500,
            "status": PositionStatus.closed,
            "opened_at": base_date - timedelta(days=2),
            "closed_at": base_date - timedelta(days=1),
            "pnl": 135,
            "pnl_pct": 1.04,
            "trading_fees": 8.2,
            "funding_fees": -1.5
        },
        {
            "bot_id": created_bots[1].id,
            "symbol": "ETHUSDT",
            "side": "long",
            "qty": 5.0,
            "leverage": 5,
            "entry_signal_price": 2250,
            "entry_fill_price": 2255,
            "current_price": 2300,
            "tp": 2400,
            "sl": 2150,
            "status": PositionStatus.open,
            "opened_at": base_date - timedelta(days=3),
            "pnl": 225,
            "pnl_pct": 2.0,
            "trading_fees": 5.6,
            "funding_fees": -2.1
        }
    ]
    
    for pos_data in positions_data:
        position = Position(**pos_data)
        db.add(position)
    
    # Create daily PnL data
    for i in range(30):
        date = (datetime.utcnow() - timedelta(days=29-i)).strftime("%Y-%m-%d")
        for bot in created_bots:
            pnl = round(random.uniform(-50, 150), 2)
            daily_pnl = DailyPnL(
                bot_id=bot.id,
                date=date,
                pnl=pnl,
                trades_count=random.randint(0, 5)
            )
            db.add(daily_pnl)
    
    # Create some outbox items
    outbox_data = [
        {
            "bot_id": created_bots[0].id,
            "symbol": "BTCUSDT",
            "side": "long",
            "action": "entry",
            "status": "pending",
            "payload": json.dumps({"price": 42500, "qty": 0.5})
        }
    ]
    
    for outbox_item in outbox_data:
        outbox = Outbox(**outbox_item)
        db.add(outbox)
    
    db.commit()
    print("Sample data initialized successfully!")

# Initialize on startup
@app.on_event("startup")
def startup_event():
    db = next(get_db())
    init_sample_data(db)

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "TradingBot API", "version": "1.0.0"}

# Bot endpoints
@app.get("/api/v1/bots", response_model=List[BotResponse])
def list_bots(db: Session = Depends(get_db)):
    return crud.get_bots(db)

@app.get("/api/v1/bots/{bot_id}", response_model=BotResponse)
def get_bot(bot_id: int, db: Session = Depends(get_db)):
    bot = crud.get_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@app.post("/api/v1/bots", response_model=BotResponse)
def create_bot(bot: BotCreate, db: Session = Depends(get_db)):
    return crud.create_bot(db, bot)

@app.patch("/api/v1/bots/{bot_id}", response_model=BotResponse)
def update_bot(bot_id: int, bot_update: BotUpdate, db: Session = Depends(get_db)):
    bot = crud.update_bot(db, bot_id, bot_update)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@app.delete("/api/v1/bots/{bot_id}")
def delete_bot(bot_id: int, db: Session = Depends(get_db)):
    success = crud.delete_bot(db, bot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Bot not found")
    return {"message": "Bot deleted"}

@app.post("/api/v1/bots/{bot_id}/pause", response_model=BotResponse)
def pause_bot(bot_id: int, db: Session = Depends(get_db)):
    bot = crud.pause_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@app.post("/api/v1/bots/{bot_id}/resume", response_model=BotResponse)
def resume_bot(bot_id: int, db: Session = Depends(get_db)):
    bot = crud.resume_bot(db, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@app.patch("/api/v1/bots/{bot_id}/auto-approve")
def set_auto_approve(bot_id: int, auto_approve: bool, db: Session = Depends(get_db)):
    bot = crud.set_auto_approve(db, bot_id, auto_approve)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return {"message": "Auto-approve updated"}

@app.get("/api/v1/bots/{bot_id}/pairs", response_model=List[BotSymbolSettingResponse])
def get_bot_symbol_settings(bot_id: int, db: Session = Depends(get_db)):
    return crud.get_bot_symbol_settings(db, bot_id)

# Position endpoints
@app.get("/api/v1/positions", response_model=List[PositionResponse])
def list_positions(
    status: Optional[str] = None,
    bot_id: Optional[int] = None,
    symbol: Optional[str] = None,
    side: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    positions = crud.get_positions(db, status, bot_id, symbol, side, skip, limit)
    # Add bot name to each position
    for position in positions:
        if position.bot:
            position.bot_name = position.bot.name
    return positions

@app.get("/api/v1/positions/{position_id}", response_model=PositionResponse)
def get_position(position_id: int, db: Session = Depends(get_db)):
    position = crud.get_position(db, position_id)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    if position.bot:
        position.bot_name = position.bot.name
    return position

@app.post("/api/v1/positions/{position_id}/set-sl-tp", response_model=PositionResponse)
def set_sl_tp(position_id: int, sl_tp: SetSlTpRequest, db: Session = Depends(get_db)):
    position = crud.set_position_sl_tp(db, position_id, sl_tp)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    return position

@app.post("/api/v1/positions/{position_id}/close", response_model=PositionResponse)
def close_position(position_id: int, db: Session = Depends(get_db)):
    position = crud.close_position(db, position_id)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    return position

# Order endpoints
@app.get("/api/v1/orders", response_model=List[OrderResponse])
def list_orders(position_id: int, db: Session = Depends(get_db)):
    return crud.get_orders_by_position(db, position_id)

# Funding endpoints
@app.get("/api/v1/funding", response_model=List[FundingResponse])
def list_funding(position_id: int, db: Session = Depends(get_db)):
    return crud.get_funding_by_position(db, position_id)

# Symbol endpoints
@app.get("/api/v1/symbols", response_model=List[SymbolResponse])
def list_symbols(db: Session = Depends(get_db)):
    return crud.get_symbols(db)

# Dashboard endpoints
@app.get("/api/v1/dashboard/daily-pnl", response_model=List[DailyPnLPoint])
def get_daily_pnl(bot_id: Optional[int] = None, days: int = 30, db: Session = Depends(get_db)):
    pnl_data = crud.get_daily_pnl(db, bot_id, days)
    return [{"date": p.date, "pnl": p.pnl} for p in pnl_data]

@app.get("/api/v1/dashboard/kpis")
def get_kpis(bot_id: Optional[int] = None, db: Session = Depends(get_db)):
    return crud.get_kpi_data(db, bot_id)

# Outbox endpoints
@app.get("/api/v1/outbox", response_model=List[OutboxResponse])
def list_outbox(status: Optional[str] = None, db: Session = Depends(get_db)):
    return crud.get_outbox(db, status)

@app.post("/api/v1/outbox/{outbox_id}/approve")
def approve_outbox(outbox_id: int, db: Session = Depends(get_db)):
    outbox = crud.approve_outbox(db, outbox_id)
    if not outbox:
        raise HTTPException(status_code=404, detail="Outbox item not found")
    return {"message": "Outbox item approved"}

@app.post("/api/v1/outbox/{outbox_id}/reject")
def reject_outbox(outbox_id: int, db: Session = Depends(get_db)):
    outbox = crud.reject_outbox(db, outbox_id)
    if not outbox:
        raise HTTPException(status_code=404, detail="Outbox item not found")
    return {"message": "Outbox item rejected"}

@app.get("/api/v1/outbox/{outbox_id}/preview")
def get_outbox_preview(outbox_id: int, db: Session = Depends(get_db)):
    preview = crud.get_outbox_preview(db, outbox_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Outbox item not found")
    return preview

# User endpoints
@app.post("/api/v1/admin/users", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = auth.get_user_by_username(db, user.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    existing_email = auth.get_user_by_email(db, user.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    new_user = auth.create_user(
        db=db,
        username=user.username,
        email=user.email,
        password=user.password,
        name=user.name,
        role=user.role
    )
    return new_user

@app.patch("/api/v1/user/profile")
def update_profile(profile: UserProfileUpdate, user_id: int = 1, db: Session = Depends(get_db)):
    user = crud.update_user_profile(db, user_id, profile.name)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Profile updated"}

@app.patch("/api/v1/user/password")
def update_password(
    password_update: UserPasswordUpdate,
    user_id: int = 1,
    db: Session = Depends(get_db)
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    if not auth.verify_password(password_update.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update to new password
    new_hash = auth.hash_password(password_update.new_password)
    crud.update_user_password(db, user_id, new_hash)
    
    return {"message": "Password updated"}

@app.patch("/api/v1/user/timezone")
def update_timezone(
    timezone_update: TimezoneUpdate,
    user_id: int = 1,
    db: Session = Depends(get_db)
):
    crud.update_user_timezone(db, user_id, timezone_update.timezone, timezone_update.use_system_timezone)
    return {"message": "Timezone updated"}

@app.get("/api/v1/user/notifications")
def get_notification_settings(user_id: int = 1, db: Session = Depends(get_db)):
    settings = crud.get_notification_settings(db, user_id)
    return settings

@app.patch("/api/v1/user/notifications")
def update_notification_settings(
    settings_update: NotificationSettingsUpdate,
    user_id: int = 1,
    db: Session = Depends(get_db)
):
    crud.update_notification_settings(db, user_id, settings_update.settings.dict())
    return {"message": "Notification settings updated"}

# Client logging endpoint
@app.post("/api/v1/client-log")
def client_log(log_data: dict):
    print(f"[CLIENT LOG] {log_data}")
    return {"message": "Log received"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
