import enum

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum, Text, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime, timezone
from .database import Base

# =========================
# USERS
# =========================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    role = Column(String, default="user")
    timezone = Column(String, default="UTC")
    webhook_secret = Column(String, nullable=True)

    bots = relationship("Bot", back_populates="user")
    positions = relationship("Position", back_populates="user")


# =========================
# BOTS
# =========================

class Bot(Base):
    __tablename__ = "bots"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

    status = Column(String, default="active")
    auto_approve = Column(Boolean, default=False)
    position_mode = Column(String, default="one_way")
    margin_mode = Column(String, default="isolated")
    default_leverage = Column(Float, default=50.0)
    tv_risk_multiplier_default = Column(Float, default=10.0)

    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc), nullable=False)

    # Ownership
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="bots")

    # UUID
    uuid = Column(String, unique=True, index=True, nullable=False)

    # Bybit linking
    api_key = Column(String, nullable=True)
    api_secret = Column(String, nullable=True)
    
    # ADDED: optional Kennzeichnung Main vs Sub (für Cashflow-Auswertung)
    account_kind = Column(String, nullable=True)  # "main" | "sub" (Dropdown im UI)  # ADDED
    exchange = Column(String, default="Bybit", nullable=True)  # man müsste die Logik noch erweitern
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    positions = relationship("Position", back_populates="bot")


class BotSymbolSetting(Base):
    __tablename__ = "bot_symbol_settings"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    target_risk_amount = Column(Float, default=1.0)
    leverage_override = Column(Float, nullable=True)

    # NEU:
    allow_long = Column(Boolean, nullable=False, default=True)
    allow_short = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc), nullable=False)


# =========================
# POSITIONS
# =========================

class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)

    # Zugehörigkeit
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)

    # ADDED: Verknüpfungen/Brücken
    trade_uid = Column(String, index=True, nullable=True)                       # ADDED
    tv_signal_id = Column(Integer, ForeignKey("tv_signals.id"), nullable=True)  # ADDED
    outbox_item_id = Column(Integer, ForeignKey("outbox_items.id"), nullable=True)  # ADDED

    symbol = Column(String, index=True, nullable=False)
    side = Column(String, nullable=True)          # "long" / "short"
    status = Column(String, nullable=False, default="open")  # "open" / "closed"

    # Menge
    qty = Column(Float, nullable=True)
    risk_amount_usdt = Column(Float, nullable=True)

    # ---------- ENTRY (3x) ----------
    entry_price_trigger = Column(Float, nullable=True)
    entry_price_best = Column(Float, nullable=True)
    entry_price_vwap = Column(Float, nullable=True)

    # ---------- EXIT ----------
    exit_price_vwap = Column(Float, nullable=True)
    exit_price_best = Column(Float, nullable=True)
    sl_price = Column(Float, nullable=True)
    tp_price = Column(Float, nullable=True)

    # ---------- Live-Markt ----------
    mark_price = Column(Float, nullable=True)

    # ---------- Fees ----------
    fee_open_usdt = Column(Float, nullable=True, default=0.0)
    fee_close_usdt = Column(Float, nullable=True, default=0.0)
    funding_usdt = Column(Float, nullable=True, default=0.0)

    # ---------- PnL ----------
    pnl_usdt = Column(Float, nullable=True)
    unrealized_pnl_usdt = Column(Float, nullable=True)

    # ---------- Exec-Dauer ----------
    first_exec_at = Column(DateTime(timezone=True), nullable=True)  # ADDED
    last_exec_at = Column(DateTime(timezone=True), nullable=True)   # ADDED

    # ---------- Times ----------
    opened_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # ---------- Slippage & Timelag ----------
    slippage_entry_usdt = Column(Float, nullable=True)
    slippage_exit_usdt  = Column(Float, nullable=True)
    slippage_timelag_usdt = Column(Float, nullable=True)

    timelag_tv_bot_ms   = Column(Float, nullable=True)
    timelag_bot_proc_ms = Column(Float, nullable=True)
    timelag_bot_exch_ms = Column(Float, nullable=True)

    # Beziehungen
    bot = relationship("Bot", back_populates="positions", lazy="joined")
    user = relationship("User", back_populates="positions", lazy="joined")
    tv_signal = relationship("TvSignal", back_populates="positions", lazy="joined")   
    orders = relationship("Order", back_populates="position", lazy="select")  
    outbox_item = relationship("OutboxItem", back_populates="positions", lazy="joined") 


# =========================
# OUTBOX (Legacy, NO CHANGE)
# =========================

class Outbox(Base):
    __tablename__ = "outbox"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)
    kind = Column(String, nullable=False)  # signal, order, etc.
    payload = Column(Text, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    bot = relationship("Bot")


class DailyPnl(Base):
    __tablename__ = "daily_pnl"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    pnl = Column(Float, default=0.0)

    bot = relationship("Bot")


# =========================
# EXECUTIONS / FUNDING / ORDERS (NO CHANGE)
# =========================

class Execution(Base):
    __tablename__ = "executions"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)
    exec_type = Column(String, nullable=True) 

    side = Column(String, nullable=True)         # 'buy'/'sell'
    price = Column(Float, nullable=True)
    qty = Column(Float, nullable=True)

    fee_usdt = Column(Float, default=0.0)
    fee_currency = Column(String, default="USDT")
    liquidity = Column(String, nullable=True)    # 'maker'/'taker'
    reduce_only = Column(Boolean, default=False) # True => Closing-Fee
    ts = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    exchange_exec_id = Column(String, index=True)
    exchange_order_id = Column(String, index=True)
    order_link_id = Column(String, index=True)

    is_consumed = Column(Boolean, nullable=False, default=False)

    bot = relationship("Bot")

    __table_args__ = (
        UniqueConstraint("bot_id", "exchange_exec_id", name="uq_exec_bot_execid"),
    )


class FundingEvent(Base):
    __tablename__ = "funding_events"
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=True)
    amount_usdt = Column(Float, default=0.0)
    rate = Column(Float, nullable=True)
    ts = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    bot = relationship("Bot")


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)

    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)

    type = Column(String, nullable=True)            # 'entry' | 'exit'
    side = Column(String, nullable=True)            # 'buy' | 'sell'
    order_type = Column(String, nullable=True)      # 'market' | 'limit' | ...
    trigger_by = Column(String, nullable=True)

    price_after_fee = Column(Float, nullable=True)
    trigger_price = Column(Float, nullable=True)
    qty = Column(Float, nullable=True)

    reduce_only = Column(Boolean, default=False)
    post_only = Column(Boolean, default=False)
    time_in_force = Column(String, nullable=True)

    status = Column(String, nullable=True)
    exchange_order_id = Column(String, unique=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    filled_at = Column(DateTime(timezone=True), nullable=True)

    bot = relationship("Bot")
    position = relationship("Position", back_populates="orders")


class Symbol(Base):
    __tablename__ = "symbols"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, unique=True, index=True)
    tick_size: Mapped[float] = mapped_column(Float)
    step_size: Mapped[float] = mapped_column(Float)
    base_currency: Mapped[str] = mapped_column(String)
    quote_currency: Mapped[str] = mapped_column(String)
    max_leverage: Mapped[float] = mapped_column(Float, default=100.0)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    icon_url = Column(String, nullable=True)                 # Quelle (CDN/Coingecko…)
    icon_local_path = Column(String, nullable=True)          # z.B. "icons/btc.png"
    icon_last_synced_at = Column(DateTime(timezone=True), nullable=True)


# =========================
# OUTBOX ITEMS (NO DELETE; ADDED trade_uid + backref)
# =========================

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

    # ADDED: Brücke
    trade_uid = Column(String(128), nullable=True, index=True)  # ADDED

    payload_entry = Column(Text, nullable=False)
    payload_sl_limit = Column(Text, nullable=False)

    status = Column(String(32), nullable=False, default="pending_approval")
    # Hinweis: gültige Werte laut deiner Vorgabe:
    # pending_approval, waiting_for_approval, sent, completed, rejected, failed, error
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="outbox_items")
    bot = relationship("Bot", backref="outbox_items")
    positions = relationship("Position", back_populates="outbox_item")  # ADDED


# =========================
# TV SIGNALS (NEU)
# =========================

class TvSignal(Base):
    __tablename__ = "tv_signals"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)

    # eindeutiger Schlüssel (wir verwenden denselben in orderLinkId)
    trade_uid = Column(String, unique=True, index=True, nullable=False)

    side = Column(String, nullable=True)              # 'long'/'short'
    entry_price_trigger = Column(Float, nullable=True)
    stop_loss_tv = Column(Float, nullable=True)
    take_profit_tv = Column(Float, nullable=True)

    tv_risk_amount = Column(Float, nullable=True)
    rrr = Column(Float, nullable=True)

    leverage_type = Column(String, nullable=True)
    leverage_size = Column(Float, nullable=True)

    tv_ts = Column(DateTime(timezone=True), nullable=True)      # TV Timestamp
    status = Column(Text, nullable=False, default="received")
    error_message = Column(Text, nullable=True)

    bot_received_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))  # Bot hat Signal empfangenU
    processed_at = Column(DateTime(timezone=True), nullable=True)                           # Bot hat Order gesendet (zumindest in Outbox)

    raw_json = Column(Text, nullable=True)  # komplette TV-JSON


    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    bot = relationship("Bot")
    positions = relationship("Position", back_populates="tv_signal")


# =========================
# CASHFLOWS (NEU) – Basis für Portfolio exkl. Unrealized
# =========================

class CashflowDirection(str, enum.Enum):  # ADDED
    deposit = "deposit"
    withdraw = "withdraw"

class Cashflow(Base):  # ADDED
    __tablename__ = "cashflows"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # optional bot_id, falls du pro Bot-UID sammelst; Portfolio aggregiert ohnehin über alle Bots
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)

    direction = Column(String, nullable=False)  # 'deposit' | 'withdraw'
    amount_usdt = Column(Float, nullable=False, default=0.0)  # Betrag in Quote (z. B. USDT)
    currency = Column(String, nullable=False, default="USDT")
    fee = Column(Float, nullable=True)

    # weiterführende Meta
    tx_type = Column(String, nullable=True)     # z. B. 'on-chain', 'off-chain'
    tx_id = Column(String, nullable=True, index=True)    # externe TX-ID (unique-ish)
    account_kind = Column(String, nullable=True)         # 'main' | 'sub'
    is_internal = Column(Boolean, nullable=False, default=True)             # sollte False sein (interne Transfers nicht speichern)
    status = Column(String, nullable=True)               # 'success', 'pending', etc.
    external_addr = Column(Text, nullable=True) 

    ts = Column(DateTime(timezone=True), nullable=True)  # Zeitpunkt des Cashflows (UTC)
    raw_json = Column(Text, nullable=True)

    user = relationship("User")
    bot = relationship("Bot")

    __table_args__ = (
        # Dedupe: dieselbe externe TX nicht doppelt (user-scope)
        UniqueConstraint("user_id", "direction", "tx_id", name="uq_cashflow_user_dir_txid"),
    )


# =========================
# Push Benachrichtigungen
# =========================

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(String, nullable=False)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")

class UserNotificationSettings(Base):
    __tablename__ = "user_notification_settings"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    trade_opened = Column(Boolean, default=True)
    trade_won = Column(Boolean, default=True)
    trade_lost = Column(Boolean, default=True)
    sltp_changed = Column(Boolean, default=True)
    trade_failed = Column(Boolean, default=True)
    system_alerts = Column(Boolean, default=True)
