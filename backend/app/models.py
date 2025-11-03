import enum

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime, timezone
from .database import Base



class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    role = Column(String, default="user")
    timezone = Column(String, default="UTC")           # optional user pref
    webhook_secret = Column(String, nullable=True)     # NEW

    bots = relationship("Bot", back_populates="user")
    positions = relationship("Position", back_populates="user")

class Bot(Base):
    __tablename__ = "bots"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    #description = Column(Text, nullable=True)
    #exchange = Column(String, default="bybit")
    #strategy = Column(String, nullable=True)
    #timeframe = Column(String, nullable=True)

    status = Column(String, default="active")
    auto_approve = Column(Boolean, default=False)
    position_mode = Column(String, default="one_way")
    margin_mode = Column(String, default="isolated")
    default_leverage = Column(Float, default=10.0)
    tv_risk_multiplier_default = Column(Float, default=1.0)

    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Ownership
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)   # NEW
    user = relationship("User", back_populates="bots")

    #UUID
    uuid = Column(String, unique=True, index=True, nullable=False)

    # Bybit linking
    api_key = Column(String, nullable=True)     # NEW
    api_secret = Column(String, nullable=True)  # NEW

    positions = relationship("Position", back_populates="bot")


class BotSymbolSetting(Base):
    __tablename__ = "bot_symbol_settings"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    target_risk_amount = Column(Float, default=1.0)   # deine "Einsatz"/Multiplier
    leverage_override = Column(Float, nullable=True)  # z.B. 10 oder None für "max"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)

    # Zugehörigkeit
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)

    symbol = Column(String, index=True, nullable=False)
    side = Column(String, nullable=True)          # "long" / "short"
    status = Column(String, nullable=False, default="open")  # "open" / "closed"

    # Menge
    qty = Column(Float, nullable=True)

    # ---------- ENTRY (3x) ----------
    # 1) was TradingView / dein Bot gesendet hat
    entry_price_trigger = Column(Float, nullable=True)

    # 2) bester Fill bei Bybit (für liquidity-slippage)
    entry_price_best = Column(Float, nullable=True)

    # 3) tatsächlicher, gewichteter Entry
    entry_price_vwap = Column(Float, nullable=True)

    # ---------- EXIT ----------
    # gewichteter Exit, aus Executions
    exit_price_vwap = Column(Float, nullable=True)

    # ---------- Live-Markt ----------
    mark_price = Column(Float, nullable=True)

    # ---------- Fees ----------
    fee_open_usdt = Column(Float, nullable=True, default=0.0)
    fee_close_usdt = Column(Float, nullable=True, default=0.0)
    funding_usdt = Column(Float, nullable=True, default=0.0)

    # ---------- PnL ----------
    # EIN Feld für "das was wir anzeigen" – bei open oft = unrealized, bei closed = final
    pnl_usdt = Column(Float, nullable=True)

    # optionales Hilfsfeld, nur WS
    unrealized_pnl_usdt = Column(Float, nullable=True)

    # ---------- Times ----------
    opened_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # Beziehungen (falls du sie benutzt)
    bot = relationship("Bot", back_populates="positions", lazy="joined")
    user = relationship("User", back_populates="positions", lazy="joined")

class Outbox(Base):
    __tablename__ = "outbox"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)
    kind = Column(String, nullable=False)  # signal, order, etc.
    payload = Column(Text, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    bot = relationship("Bot")

class DailyPnl(Base):
    __tablename__ = "daily_pnl"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    pnl = Column(Float, default=0.0)

    bot = relationship("Bot")

# --- NEU: einzelne Fills/Ausführungen mit Gebühren (für Opening/Closing-Split) ---
class Execution(Base):
    __tablename__ = "executions"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)

    side = Column(String, nullable=True)         # 'buy'/'sell'
    price = Column(Float, nullable=True)
    qty = Column(Float, nullable=True)

    fee_usdt = Column(Float, default=0.0)
    fee_currency = Column(String, default="USDT")
    liquidity = Column(String, nullable=True)    # 'maker'/'taker'
    reduce_only = Column(Boolean, default=False) # True => Closing-Fee
    ts = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # das neue Feld:
    exchange_exec_id = Column(String, index=True)      # z.B. "650cd628-..." von Bybit
    exchange_order_id = Column(String, index=True)
    order_link_id = Column(String, index=True)

    bot = relationship("Bot")
    
    __table_args__ = (
        # wichtig: ein Bot kann dieselbe execId NIE zweimal haben
        UniqueConstraint("bot_id", "exchange_exec_id", name="uq_exec_bot_execid"),
    )

# --- NEU: Funding-Events (Zinszahlungen) ---
class FundingEvent(Base):
    __tablename__ = "funding_events"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=True)
    amount_usdt = Column(Float, default=0.0)
    rate = Column(Float, nullable=True)          # optional: funding rate
    ts = Column(DateTime, default=datetime.utcnow, nullable=False)

    bot = relationship("Bot")

    
# --- Orders (Exchange-Orders, als Anker für Executions) ---
class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)

    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)

    # Meta
    type = Column(String, nullable=True)            # 'entry' | 'exit' (Heuristik)
    side = Column(String, nullable=True)            # 'buy' | 'sell'
    order_type = Column(String, nullable=True)      # 'market' | 'limit' | ...
    trigger_by = Column(String, nullable=True)      # optional

    # Werte
    price_after_fee = Column(Float, nullable=True)
    trigger_price = Column(Float, nullable=True)
    qty = Column(Float, nullable=True)

    # Flags
    reduce_only = Column(Boolean, default=False)
    post_only = Column(Boolean, default=False)
    time_in_force = Column(String, nullable=True)

    status = Column(String, nullable=True)          # 'new' | 'partially_filled' | 'filled' | 'canceled' | ...
    exchange_order_id = Column(String, unique=True, index=True)  # Bybit orderId (global eindeutig)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    filled_at = Column(DateTime, nullable=True)

    bot = relationship("Bot")

class Symbol(Base):
    __tablename__ = "symbols"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, unique=True, index=True)
    tick_size: Mapped[float] = mapped_column(Float)
    step_size: Mapped[float] = mapped_column(Float)
    base_currency: Mapped[str] = mapped_column(String)
    quote_currency: Mapped[str] = mapped_column(String)
    max_leverage: Mapped[float] = mapped_column(Float, default=100.0)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

# ------------------ OutboxItem (store TV payloads & send status) ------------------
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

class OutboxStatusEnum(str, enum.Enum):
    pending_approval = "pending_approval"
    sent = "sent"
    error = "error"

class OutboxItem(Base):
    __tablename__ = "outbox_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String(32), nullable=False)

    payload_entry = Column(Text, nullable=False)
    payload_sl_limit = Column(Text, nullable=False)

    status = Column(String(32), nullable=False, default="pending_approval")
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", backref="outbox_items")
    bot = relationship("Bot", backref="outbox_items")
