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
  botId: number;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  entrySignalPrice: number;
  entryFillPrice?: number;
  tp?: number;
  sl?: number;
  status: 'open' | 'closed' | 'error';
  openedAt: string;
  closedAt?: string;
  pnl?: number;
  pnlPct?: number;
  tradingFees?: number;
  fundingFees?: number;
  slippagePct?: number;
  timelagMs?: number;
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
