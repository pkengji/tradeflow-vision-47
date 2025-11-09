// src/lib/api.ts
// Einheitliche API-Schicht fürs TradingBot-Backend
// - Bewahrt Backcompat: apiRequest<T>, actions, default- und named-Export
// - Fügt robuste http-Helper + typisierte api-Methoden hinzu

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface FetchOpts {
  method?: HttpMethod;
  query?: Record<string, any>;
  body?: any;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

// ---------- Helper ----------

function withQuery(path: string, query?: Record<string, any>) {
  if (!query || Object.keys(query).length === 0) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  return `${path}?${usp.toString()}`;
}

async function http<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const urlStr = `${API_BASE}${withQuery(path, opts.query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  const res = await fetch(urlStr, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body:
      opts.body === undefined
        ? undefined
        : typeof opts.body === 'string'
        ? opts.body
        : JSON.stringify(opts.body),
    signal: controller.signal,
    mode: 'cors',
    credentials: 'include',
  }).catch((e) => {
    clearTimeout(timeout);
    throw new Error(`Network error: ${e}`);
  });

  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${urlStr}: ${text}`);
  }

  if (res.status === 204) return null as unknown as T;

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const t = await res.text();
    return t as unknown as T;
  }

  return (await res.json()) as T;
}

// ---------- Roh-Typen vom Backend (aktualisiert) ----------

type BotRow = {
  id: number;
  name: string;
  user_id: number;
  uuid: string;
  description?: string | null;
  exchange?: string | null;
  strategy?: string | null;
  timeframe?: string | null;
  status: string; // 'active' | 'paused' | 'deleted'
  auto_approve: boolean;
  position_mode?: string | null;
  margin_mode?: string | null;
  default_leverage?: number | null;
  tv_risk_multiplier_default?: number | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  has_exchange_keys?: boolean;
  api_key_masked?: string | null;
};

type SymbolRow = {
  symbol: string;
  tick_size?: number | string | null;
  step_size?: number | string | null;
  base_currency?: string | null;
  quote_currency?: string | null;
};

type PositionsResponseRaw = {
  items: any[];
};

type PnlDailyRowRaw = {
  day: string;
  pnl_net_usdt: number;
};

// ---------- Frontend-Typen (stabil) ----------

export type Bot = {
  id: number;
  name: string;
  user_id: number;
  uuid: string;
  description?: string | null;
  exchange?: string | null;
  strategy?: string | null;
  timeframe?: string | null;
  status: string; // 'active' | 'paused' | 'deleted'
  auto_approve: boolean;
  position_mode?: string | null;
  margin_mode?: string | null;
  default_leverage?: number | null;
  tv_risk_multiplier_default?: number | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string | null;
  has_exchange_keys?: boolean;
  api_key_masked?: string | null;
};

export type PositionListItem = {
  id: number;
  bot_id: number;
  bot_name: string | null;
  symbol: string;
  side: 'long' | 'short' | null;
  status: string; // 'open' | 'closed'
  qty: number | null;
  entry_price: number | null;
  entry_price_trigger?: number | null;
  entry_price_best?: number | null;
  entry_price_vwap?: number | null;
  exit_price?: number | null; // exit_price_vwap
  mark_price?: number | null;
  sl?: number | null; // sl_price
  tp?: number | null; // tp_price
  pnl: number | null; // pnl_usdt oder unrealized_pnl_usdt
  fee_open_usdt?: number | null;
  fee_close_usdt?: number | null;
  funding_usdt?: number | null;
  opened_at: string | null;
  closed_at: string | null;
  trade_uid?: string | null;
  tv_signal_id?: number | null;
  outbox_item_id?: number | null;
  first_exec_at?: string | null;
  last_exec_at?: string | null;
};

export type PnlDailyPoint = { date: string; pnl: number };

// Aliases für bestehende Importe in Dashboard.tsx
export type DailyPnl = PnlDailyPoint;
// Gern später präzisieren, sobald /summary final ist:
export type Summary = Record<string, any>;

export type OutboxItem = {
  id: number;
  kind: string;
  status: 'queued' | 'approved' | 'rejected' | 'sent' | 'failed';
  position_id: number | null;
  payload?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export type Trade = {
  id: number;
  symbol: string;
  side: 'long' | 'short' | 'buy' | 'sell';
  qty?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  mark_price?: number | null;
  sl?: number | null;
  tp?: number | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string | null;
  bot_id?: number | null;
  bot_name?: string | null;
  timelag_ms?: number | null;
  slippage_bp?: number | null;
  fees_usdt?: number | null;
};

export type TradesResponse = {
  items: Trade[];
  total: number;
  page: number;
  page_size: number;
};

// ---------- API-Funktionen ----------

async function getBots(): Promise<Bot[]> {
  try {
    const rows = await http<BotRow[]>('/api/v1/bots');
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      user_id: b.user_id,
      uuid: b.uuid,
      description: b.description ?? null,
      exchange: b.exchange ?? null,
      strategy: b.strategy ?? null,
      timeframe: b.timeframe ?? null,
      status: b.status,
      auto_approve: b.auto_approve,
      position_mode: b.position_mode ?? null,
      margin_mode: b.margin_mode ?? null,
      default_leverage: b.default_leverage ?? null,
      tv_risk_multiplier_default: b.tv_risk_multiplier_default ?? null,
      is_active: b.is_active,
      is_deleted: b.is_deleted,
      created_at: b.created_at,
      updated_at: b.updated_at ?? null,
      has_exchange_keys: b.has_exchange_keys ?? false,
      api_key_masked: b.api_key_masked ?? null,
    }));
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { MOCK_BOTS } = await import('./mockData');
    return MOCK_BOTS;
  }
}

async function pauseBot(id: number) {
  return http(`/api/v1/bots/${id}/pause`, { method: 'POST' });
}
async function resumeBot(id: number) {
  return http(`/api/v1/bots/${id}/resume`, { method: 'POST' });
}
async function deleteBot(id: number) {
  return http(`/api/v1/bots/${id}`, { method: 'DELETE' });
}
async function getBotExchangeKeys(id: number): Promise<{ api_key_masked: string | null; has_api_secret: boolean }> {
  return http(`/api/v1/bots/${id}/exchange-keys`);
}
async function setBotExchangeKeys(id: number, api_key: string, api_secret: string) {
  return http(`/api/v1/bots/${id}/exchange-keys`, { method: 'PUT', body: { api_key, api_secret } });
}

async function setBotAutoApprove(bot_id: number, auto_approve: boolean) {
  return http(`/api/v1/bots/${bot_id}/auto-approve`, {
    method: 'PATCH',
    body: { auto_approve },
  });
}

type PositionsParams = { status?: string; bot_id?: number; symbol?: string; side?: string };

async function getPositions(params?: PositionsParams): Promise<{ items: PositionListItem[] }> {
  try {
    const res = await http<{ items: any[]; total: number; page: number; page_size: number }>('/api/v1/positions', { query: params });
    const items = (res.items ?? []).map((p: any): PositionListItem => ({
      id: p.id,
      bot_id: p.bot_id,
      bot_name: p.bot_name ?? null,
      symbol: p.symbol,
      side: p.side ?? null,
      status: p.status,
      qty: p.qty ?? null,
      entry_price: p.entry_price ?? null,
      entry_price_trigger: p.entry_price_trigger ?? null,
      entry_price_best: p.entry_price_best ?? null,
      entry_price_vwap: p.entry_price_vwap ?? null,
      exit_price: p.exit_price ?? null,
      mark_price: p.mark_price ?? null,
      sl: p.sl_price ?? null,
      tp: p.tp_price ?? null,
      pnl: p.pnl ?? null,
      fee_open_usdt: p.fee_open_usdt ?? null,
      fee_close_usdt: p.fee_close_usdt ?? null,
      funding_usdt: p.funding_usdt ?? null,
      opened_at: p.opened_at ?? null,
      closed_at: p.closed_at ?? null,
      trade_uid: p.trade_uid ?? null,
      tv_signal_id: p.tv_signal_id ?? null,
      outbox_item_id: p.outbox_item_id ?? null,
      first_exec_at: p.first_exec_at ?? null,
      last_exec_at: p.last_exec_at ?? null,
    }));
    return { items };
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { generateAllMockTrades } = await import('./mockData');
    return { items: generateAllMockTrades() };
  }
}

async function getPosition(id: number): Promise<any> {
  try {
    return await http<any>(`/api/v1/positions/${id}`);
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { generateMockPositionDetail } = await import('./mockData');
    return generateMockPositionDetail(id);
  }
}

async function setPositionSlTp(position_id: number, params: { sl?: number; tp?: number }) {
  return http(`/api/v1/positions/${position_id}/set-sl-tp`, { method: 'POST', body: params });
}

async function closePosition(position_id: number) {
  return http(`/api/v1/positions/${position_id}/close`, { method: 'POST' });
}

async function getOrders(position_id: number): Promise<any[]> {
  try {
    return await http<any[]>('/api/v1/orders', { query: { position_id } });
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { generateMockOrders } = await import('./mockData');
    return generateMockOrders(position_id);
  }
}

async function getFunding(position_id: number): Promise<any[]> {
  try {
    return await http<any[]>('/api/v1/funding', { query: { position_id } });
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { generateMockFunding } = await import('./mockData');
    return generateMockFunding(position_id);
  }
}

async function getSymbols(): Promise<string[]> {
  try {
    const rows = await http<SymbolRow[]>('/api/v1/symbols');
    return rows.map((s) => s.symbol ?? (s as any).name ?? String(s));
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { MOCK_SYMBOLS } = await import('./mockData');
    return MOCK_SYMBOLS;
  }
}

export type SymbolInfo = {
  symbol: string;
  max_leverage?: number;
  tick_size?: number;
  step_size?: number;
  base_currency?: string;
  quote_currency?: string;
  icon_url?: string;
  icon_local_path?: string;
};

async function getAllSymbols(): Promise<SymbolInfo[]> {
  const rows = await http<any[]>('/api/v1/symbols/all');
  return rows.map((s) => ({
    symbol: s.symbol,
    max_leverage: s.max_leverage ?? s.maxLeverage ?? 100,
    tick_size: s.tick_size ?? s.tickSize,
    step_size: s.step_size ?? s.stepSize,
    base_currency: s.base_currency ?? s.baseCurrency,
    quote_currency: s.quote_currency ?? s.quoteCurrency,
    icon_url: s.icon_url,
    icon_local_path: s.icon_local_path,
  }));
}

export type BotSymbolSetting = {
  id: number;
  bot_id: number;
  symbol: string;
  enabled: boolean;
  target_risk_amount?: number;
  leverage_override?: number;
};

async function getBotSymbols(bot_id: number): Promise<BotSymbolSetting[]> {
  return http<BotSymbolSetting[]>(`/api/v1/bots/${bot_id}/symbols`);
}

async function getDailyPnl(params?: { days?: number; bot_id?: number }): Promise<PnlDailyPoint[]> {
  try {
    const rows = await http<PnlDailyRowRaw[]>('/api/v1/dashboard/daily-pnl', { query: params });
    return rows.map((r) => ({ date: r.day || r.date, pnl: r.pnl_net_usdt ?? r.pnl ?? 0 }));
  } catch (error) {
    console.warn('API Error getting daily PnL:', error);
    return [];
  }
}

async function getOutbox(params?: { status?: string; limit?: number }): Promise<OutboxItem[]> {
  return http<OutboxItem[]>('/api/v1/outbox', { query: params });
}
async function approveOutbox(id: number): Promise<OutboxItem> {
  return http<OutboxItem>(`/api/v1/outbox/${id}/approve`, { method: 'POST' });
}
async function rejectOutbox(id: number): Promise<OutboxItem> {
  return http<OutboxItem>(`/api/v1/outbox/${id}/reject`, { method: 'POST' });
}
async function previewOutbox(id: number): Promise<any> {
  return http(`/api/v1/outbox/${id}/preview`);
}

async function logAction(event: string, payload?: any): Promise<null | any> {
  return http('/api/v1/client-log', {
    method: 'POST',
    body: { event, payload, ts: new Date().toISOString() },
  });
}

async function getAvailablePairs(): Promise<Array<{ symbol: string; name: string; icon?: string; icon_url?: string; max_leverage?: number }>> {
  try {
    const symbols = await getAllSymbols();
    return symbols.map((s) => ({
      symbol: s.symbol,
      name: s.base_currency || s.symbol.replace('USDT', ''),
      icon: s.icon_local_path || s.icon_url, // Prioritize local path, then URL
      icon_url: s.icon_url,
      max_leverage: s.max_leverage,
    }));
  } catch (error) {
    console.warn('API Error, using mock data:', error);
    const { MOCK_AVAILABLE_PAIRS } = await import('./mockData');
    return MOCK_AVAILABLE_PAIRS;
  }
}

// Bot management
async function createBot(data: Partial<Bot>): Promise<Bot> {
  return http<Bot>('/api/v1/bots', { method: 'POST', body: data });
}

async function updateBot(id: number, data: Partial<Bot>): Promise<Bot> {
  return http<Bot>(`/api/v1/bots/${id}`, { method: 'PATCH', body: data });
}

// Auth

async function login(credentials: { email?: string; username?: string; password: string }): Promise<any> {
  return http('/api/v1/auth/login', { method: 'POST', body: credentials });
}

async function logout(): Promise<any> {
  return http('/api/v1/auth/logout', { method: 'POST' });
}

async function getMe(): Promise<any> {
  return http('/api/v1/me');
}

// User settings
async function updateUserProfile(data: { username?: string; email?: string }): Promise<any> {
  return http('/api/v1/me', { method: 'PATCH', body: data });
}

async function updateUserPassword(data: { new_password: string }): Promise<any> {
  return http('/api/v1/me/password', { method: 'POST', body: data });
}

async function getWebhookSecret(): Promise<{ webhook_secret: string }> {
  return http('/api/v1/me/webhook-secret');
}

async function rotateWebhookSecret(): Promise<{ webhook_secret: string }> {
  return http('/api/v1/me/webhook-secret/rotate', { method: 'POST' });
}

// User management (admin)
async function createUser(data: { username: string; email: string; password: string; role?: string }): Promise<any> {
  return http('/api/v1/users', { method: 'POST', body: data });
}

// ---------- Export-Objekt ----------

export const api = {
  // Auth
  login,
  logout,
  getMe,

  // Bots
  getBots,
  createBot,
  updateBot,
  pauseBot,
  resumeBot,
  deleteBot,
  setBotAutoApprove,
  getBotExchangeKeys,
  setBotExchangeKeys,

  // Positions / Trades
  getPositions,
  getPosition,
  setPositionSlTp,
  closePosition,

  // Orders / Funding
  getOrders,
  getFunding,

  // Symbols / PnL
  getSymbols,
  getAllSymbols,
  getBotSymbols,
  getDailyPnl,
  getAvailablePairs,

  // Outbox
  getOutbox,
  approveOutbox,
  rejectOutbox,
  previewOutbox,

  // User settings
  updateUserProfile,
  updateUserPassword,
  getWebhookSecret,
  rotateWebhookSecret,

  // Admin
  createUser,

  // Misc
  logAction,
};

export default api;

// ---------- Backcompat: generisches apiRequest + actions ----------

// Nutzung: apiRequest<T>(path, { method?, body?, headers? })
export async function apiRequest<T = any>(
  path: string,
  opts: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<T> {
  return http<T>(path, {
    method: (opts.method ?? 'GET') as any,
    body: opts.body,
    headers: opts.headers,
  });
}

// Legacy-Pfade beibehalten, falls irgendwo noch verwendet:
async function legacySetTpSl(positionId: number, payload: { tp: number | null; sl: number | null }) {
  return apiRequest(`/api/v1/trades/${positionId}/set-tp-sl`, { method: 'POST', body: payload });
}
async function legacyClosePosition(positionId: number) {
  return apiRequest(`/api/v1/trades/${positionId}/close`, { method: 'POST' });
}

export const actions = {
  setTpSl: legacySetTpSl,   // alte Signatur/Pfad intakt
  closePosition: legacyClosePosition,
};
