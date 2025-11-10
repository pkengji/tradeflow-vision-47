export type Role = 'admin' | 'trader' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Bot {
  id: number;
  name: string;
  description?: string;
  exchange: 'bybit' | 'binance' | 'okx' | 'other';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotSymbolSetting {
  id: number;
  botId: number;
  symbol: string;
  maxLeverage?: number;
}

export interface Position {
  id: number;
  bot_id: number;
  bot_name?: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  status: 'open' | 'closed' | 'error';
  
  // Prices
  entry_price: number; // VWAP
  entry_price_vwap?: number;
  entry_price_best?: number;
  entry_price_trigger?: number;
  exit_price?: number;
  mark_price?: number;
  current_price?: number;
  sl?: number;
  tp?: number;
  
  // PnL
  pnl?: number; // realized PnL for closed positions
  unrealized_pnl?: number; // for open positions
  pnl_pct?: number;
  
  // Fees
  fee_open_usdt?: number;
  fee_close_usdt?: number;
  funding_usdt?: number;
  
  // Slippage
  slippage_liquidity_open?: number;
  slippage_liquidity_close?: number;
  slippage_timelag?: number;
  
  // Timelags
  timelag_tv_to_bot?: number;
  timelag_bot_processing?: number;
  timelag_bot_to_exchange?: number;
  timelag_close_tv_to_bot?: number;
  timelag_close_bot_processing?: number;
  timelag_close_bot_to_exchange?: number;
  
  // Timestamps
  opened_at: string;
  closed_at?: string;
  first_exec_at?: string;
  last_exec_at?: string;
  
  // Other fields
  trade_uid?: string;
  tv_signal_id?: number;
  outbox_item_id?: number;
  leverage?: number;
  leverage_size?: number;
  leverage_type?: string;
  position_size_usdt?: number;
  tv_qty?: number;
  trigger_price?: number;
  trade_id?: string;
}

export interface Order {
  id: number;
  positionId: number;
  type: string;
  side: string;
  price: number;
  qty: number;
  status: string;
  createdAt: string;
}

export interface FundingRecord {
  id: number;
  positionId: number;
  amount: number;
  rate: number;
  timestamp: string;
}

export interface SignalLog {
  id: number;
  positionId?: number;
  botId: number;
  symbol?: string;
  type: 'entry' | 'exit' | 'modify' | 'close' | 'other';
  status: 'ok' | 'failed';
  timestamp: string;
  latencyMs?: number;
  request?: any;
  response?: any;
  humanMessage?: string;
}

export interface Symbol {
  symbol: string;
  tickSize: number;
  stepSize: number;
}

export interface KPIData {
  pnlTotal: number;
  winRate: number;
  tradesCount: number;
  avgFees: number;
  fundingFees: number;
  avgTimelag: number;
}

export interface PositionsResponse {
  positions: Position[];
  total: number;
}
