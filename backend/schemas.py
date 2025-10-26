from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime

# Bot Schemas
class BotBase(BaseModel):
    name: str
    description: Optional[str] = None
    exchange: str = "bybit"
    strategy: Optional[str] = None
    timeframe: Optional[str] = None

class BotCreate(BotBase):
    pass

class BotUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    exchange: Optional[str] = None
    strategy: Optional[str] = None
    timeframe: Optional[str] = None
    default_leverage: Optional[int] = None

class BotResponse(BotBase):
    id: int
    status: str
    is_active: bool
    auto_approve: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Position Schemas
class PositionBase(BaseModel):
    symbol: str
    side: str
    qty: float
    entry_signal_price: float

class PositionResponse(BaseModel):
    id: int
    bot_id: int
    bot_name: Optional[str] = None
    symbol: str
    side: str
    qty: float
    leverage: Optional[int] = None
    current_price: Optional[float] = None
    entry_signal_price: float
    entry_fill_price: Optional[float] = None
    tp: Optional[float] = None
    sl: Optional[float] = None
    status: str
    opened_at: datetime
    closed_at: Optional[datetime] = None
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    trading_fees: Optional[float] = None
    funding_fees: Optional[float] = None

    class Config:
        from_attributes = True

class SetSlTpRequest(BaseModel):
    sl: Optional[float] = None
    tp: Optional[float] = None

# User Schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    name: Optional[str] = None
    role: str = "viewer"

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    name: Optional[str]
    role: str

    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None

class UserPasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class TimezoneUpdate(BaseModel):
    timezone: str
    use_system_timezone: bool

class NotificationSettings(BaseModel):
    position_opened: dict
    position_closed: dict
    sl_hit: dict
    tp_hit: dict
    bot_error: dict
    outbox_pending: dict

class NotificationSettingsUpdate(BaseModel):
    settings: NotificationSettings

# Symbol Schemas
class SymbolResponse(BaseModel):
    symbol: str
    tick_size: float
    step_size: float

    class Config:
        from_attributes = True

# Order Schemas
class OrderResponse(BaseModel):
    id: int
    position_id: int
    type: str
    side: str
    price: float
    qty: float
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# Funding Schemas
class FundingResponse(BaseModel):
    id: int
    position_id: int
    amount: float
    rate: float
    timestamp: datetime

    class Config:
        from_attributes = True

# Dashboard Schemas
class DailyPnLPoint(BaseModel):
    date: str
    pnl: float

# Outbox Schemas
class OutboxResponse(BaseModel):
    id: int
    bot_id: int
    position_id: Optional[int]
    symbol: Optional[str]
    side: Optional[str]
    action: str
    status: str
    payload: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class BotSymbolSettingResponse(BaseModel):
    id: int
    bot_id: int
    symbol: str
    max_leverage: Optional[int]

    class Config:
        from_attributes = True
