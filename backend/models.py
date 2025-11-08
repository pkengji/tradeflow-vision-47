from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class BotStatus(enum.Enum):
    active = "active"
    paused = "paused"
    error = "error"
    deleted = "deleted"

class PositionSide(enum.Enum):
    long = "long"
    short = "short"

class PositionStatus(enum.Enum):
    open = "open"
    closed = "closed"
    error = "error"

class OutboxStatus(enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class Bot(Base):
    __tablename__ = "bots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    exchange = Column(String, default="bybit")
    strategy = Column(String)
    timeframe = Column(String)
    status = Column(Enum(BotStatus), default=BotStatus.active)
    auto_approve = Column(Boolean, default=False)
    position_mode = Column(String, default="one_way")
    margin_mode = Column(String, default="isolated")
    default_leverage = Column(Integer, default=10)
    tv_risk_multiplier_default = Column(Float, default=1.0)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    positions = relationship("Position", back_populates="bot")
    symbol_settings = relationship("BotSymbolSetting", back_populates="bot")

class BotSymbolSetting(Base):
    __tablename__ = "bot_symbol_settings"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"))
    symbol = Column(String, nullable=False)
    max_leverage = Column(Integer)

    bot = relationship("Bot", back_populates="symbol_settings")

class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"))
    symbol = Column(String, nullable=False)
    side = Column(Enum(PositionSide), nullable=False)
    qty = Column(Float, nullable=False)
    leverage = Column(Integer)
    current_price = Column(Float)
    entry_signal_price = Column(Float, nullable=False)
    entry_fill_price = Column(Float)
    tp = Column(Float)
    sl = Column(Float)
    backup_sl = Column(Float)
    status = Column(Enum(PositionStatus), default=PositionStatus.open)
    opened_at = Column(DateTime, server_default=func.now())
    closed_at = Column(DateTime)
    pnl = Column(Float)
    pnl_pct = Column(Float)
    trading_fees = Column(Float, default=0.0)
    funding_fees = Column(Float, default=0.0)
    slippage_pct = Column(Float)
    timelag_ms = Column(Integer)
    rr = Column(Float)

    bot = relationship("Bot", back_populates="positions")
    orders = relationship("Order", back_populates="position")
    funding_records = relationship("FundingRecord", back_populates="position")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"))
    type = Column(String, nullable=False)
    side = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    qty = Column(Float, nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, server_default=func.now())
    filled_at = Column(DateTime)

    position = relationship("Position", back_populates="orders")
    executions = relationship("Execution", back_populates="order")

class Execution(Base):
    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    price = Column(Float, nullable=False)
    qty = Column(Float, nullable=False)
    fee_usdt = Column(Float, default=0.0)
    liquidity = Column(String)
    ts = Column(DateTime, server_default=func.now())

    order = relationship("Order", back_populates="executions")

class FundingRecord(Base):
    __tablename__ = "funding_records"

    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"))
    amount = Column(Float, nullable=False)
    rate = Column(Float, nullable=False)
    timestamp = Column(DateTime, server_default=func.now())

    position = relationship("Position", back_populates="funding_records")

class Symbol(Base):
    __tablename__ = "symbols"

    symbol = Column(String, primary_key=True)
    tick_size = Column(Float, nullable=False)
    step_size = Column(Float, nullable=False)
    base_currency = Column(String)
    quote_currency = Column(String, default="USDT")

class Outbox(Base):
    __tablename__ = "outbox"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"))
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)
    symbol = Column(String)
    side = Column(String)
    action = Column(String, nullable=False)
    status = Column(Enum(OutboxStatus), default=OutboxStatus.pending)
    payload = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    processed_at = Column(DateTime)

class SignalLog(Base):
    __tablename__ = "signal_logs"

    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)
    bot_id = Column(Integer, ForeignKey("bots.id"))
    symbol = Column(String)
    type = Column(String, nullable=False)
    status = Column(String, default="ok")
    timestamp = Column(DateTime, server_default=func.now())
    latency_ms = Column(Integer)
    request = Column(Text)
    response = Column(Text)
    human_message = Column(Text)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String)
    role = Column(String, default="viewer")
    created_at = Column(DateTime, server_default=func.now())

class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    timezone = Column(String, default="Europe/Berlin")
    use_system_timezone = Column(Boolean, default=True)
    notification_settings = Column(Text)

class DailyPnL(Base):
    __tablename__ = "daily_pnl"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True)
    date = Column(String, nullable=False)
    pnl = Column(Float, default=0.0)
    trades_count = Column(Integer, default=0)
