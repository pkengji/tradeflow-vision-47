from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
import secrets

# ---------- Users ----------
class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str
    timezone: str

    class Config:
        from_attributes = True

class CreateUserBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=4, max_length=128)
    role: Optional[str] = "user"

class UpdateUserBody(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None

class UpdatePasswordBody(BaseModel):
    new_password: str = Field(..., min_length=4, max_length=128)

class WebhookSecretOut(BaseModel):
    webhook_secret: str
    
class LoginBody(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: str

# ---------- Bots ----------
class BotCreate(BaseModel):
    name: str
    description: Optional[str] = None
    exchange: Optional[str] = "bybit"
    strategy: Optional[str] = None
    timeframe: Optional[str] = None
    auto_approve: Optional[bool] = False
    api_key: Optional[str] = None
    api_secret: Optional[str] = None

class BotOut(BaseModel):
    id: int
    name: str
    user_id: int
    uuid: str
    description: Optional[str] = None
    exchange: Optional[str] = None
    strategy: Optional[str] = None
    timeframe: Optional[str] = None
    status: str
    auto_approve: bool
    position_mode: str
    margin_mode: str
    default_leverage: float
    tv_risk_multiplier_default: float
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: Optional[datetime]
    api_key: Optional[str] = None
    api_secret: Optional[str] = None

    class Config:
        from_attributes = True

class BotUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    exchange: Optional[str] = "bybit"
    strategy: Optional[str] = None
    timeframe: Optional[str] = None
    auto_approve: Optional[bool] = False
    api_key: Optional[str] = None
    api_secret: Optional[str] = None

class BotExchangeKeysIn(BaseModel):
    api_key: str
    api_secret: str
    
class BotExchangeKeysOut(BaseModel):
    api_key_masked: Optional[str] = None
    has_api_secret: bool
    
class BotSymbolSettingIn(BaseModel):
    symbol: str
    enabled: bool = True
    target_risk_amount: float = 1.0
    leverage_override: Optional[float] = None

class BotSymbolSettingOut(BotSymbolSettingIn):
    id: int
    bot_id: int

    class Config:
        from_attributes = True
        
class SymbolOut(BaseModel):
    symbol: str
    tick_size: float
    step_size: float
    base_currency: str
    quote_currency: str
    max_leverage: float
    icon_candidates: list[str] = []
    # refreshed_at lassen wir in der Response weg (kannst du leicht ergänzen)

# ---------- Positions / Outbox / PnL ----------
class PositionOut(BaseModel):
    id: int
    bot_id: int
    symbol: str
    side: Optional[str] = None
    status: str

    qty: Optional[float] = None

    entry_price_trigger: Optional[float] = None
    entry_price_best: Optional[float] = None
    entry_price_vwap: Optional[float] = None

    exit_price_vwap: Optional[float] = None
    mark_price: Optional[float] = None

    fee_open_usdt: Optional[float] = None
    fee_close_usdt: Optional[float] = None

    # das eine Feld fürs Frontend
    pnl_usdt: Optional[float] = None

    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

        
class PositionsResponse(BaseModel):
    ok: bool
    items: List[PositionOut]
    count: int


class OutboxOut(BaseModel):
    id: int
    bot_id: int
    kind: str
    payload: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class DailyPnlPoint(BaseModel):
    date: str
    pnl: float
    equity: float


# ---------- Cashflows / Portfolio (ADDED) ----------

class CashflowOut(BaseModel):
    id: int
    user_id: int
    bot_id: Optional[int] = None
    account_type: Optional[str] = None  # 'main' | 'sub' | None
    direction: str                      # 'deposit' | 'withdraw'
    amount_usdt: float
    currency: str
    tx_id: Optional[str] = None
    external_addr: Optional[str] = None
    is_internal: bool
    ts: Optional[datetime] = None

    class Config:
        from_attributes = True


class PortfolioValueOut(BaseModel):
    ok: bool
    from_: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None
    deposits: float
    withdrawals: float
    realized_pnl: float
    portfolio_value: float
