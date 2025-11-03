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
    credentials: 'include', // <<< WICHTIG: Cookie (uid) mitsenden
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

// ---------- Roh-Typen vom Backend ----------

type BotRow = {
  id: number;
  name: string;
  strategy?: string | null;
  timeframe?: string | null;
  tv_risk_multiplier_default?: number | null;
  position_mode?: string | null;
  margin_mode?: string | null;
  default_leverage?: number | null;
  status: 'active' | 'paused' | 'deleted';
  auto_approve: boolean;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string | null;
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
  strategy?: string | null;
  timeframe?: string | null;
  tv_risk_multiplier_default?: number | null;
  position_mode?: string | null;
  margin_mode?: string | null;
  default_leverage?: number | null;
  status: 'active' | 'paused' | 'deleted';
  auto_approve: boolean;
  uuid: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  secret: string | null;
  max_leverage: number | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string | null;
};

export type BotSymbolSettingIn = {
  symbol: string;
  enabled: boolean;
  target_risk_amount: number;
  leverage_override?: number | null;
};


export type PositionListItem = {
  id: number;
  symbol: string;
  side: 'long' | 'short';
  status: 'open' | 'closed';

  // Preise
  entry_price_trigger: number | null;
  entry_price_best: number | null;
  entry_price_vwap: number | null;
  exit_price_vwap: number | null;
  mark_price: number | null;

  // Menge
  qty: number | null;

  // Fees
  fee_open_usdt: number | null;
  fee_close_usdt: number | null;
  funding_usdt?: number | null; // kommt evtl. später vom Backend, deshalb optional

  // PnL
  pnl_usdt: number | null;
  unrealized_pnl_usdt: number | null;

  // Zeiten
  opened_at: string | null;
  closed_at: string | null;

  // Meta
  bot_id?: number | null;
  bot_name: string | null;

  // Für MiniRange
  sl?: number | null;
  tp?: number | null;
};

export type PositionsResponse = {
  items: PositionListItem[];
  total: number;
  page: number;
  page_size: number;
};

function mapPositionRow(row: any): PositionListItem {
  // Fallback-Logik für Entry: wir nehmen zuerst VWAP, dann Best, dann Trigger
  const entry =
    row.entry_price_vwap ??
    row.entry_price_best ??
    row.entry_price_trigger ??
    row.entry_price ??
    null;

  return {
    id: row.id,
    symbol: row.symbol,
    side: (row.side ?? 'long') as 'long' | 'short',
    status: (row.status ?? 'open') as 'open' | 'closed',

    entry_price_trigger: row.entry_price_trigger ?? null,
    entry_price_best: row.entry_price_best ?? null,
    entry_price_vwap: row.entry_price_vwap ?? entry,
    exit_price_vwap: row.exit_price_vwap ?? row.exit_price ?? null,
    mark_price: row.mark_price ?? null,

    qty: row.qty ?? null,

    fee_open_usdt: row.fee_open_usdt ?? row.fee_opening_usdt ?? null,
    fee_close_usdt: row.fee_close_usdt ?? row.fee_closing_usdt ?? null,
    funding_usdt: row.funding_usdt ?? null,

    pnl_usdt: row.pnl_usdt ?? row.realized_pnl_net_usdt ?? null,
    unrealized_pnl_usdt: row.unrealized_pnl_usdt ?? null,

    opened_at: row.opened_at ?? null,
    closed_at: row.closed_at ?? null,

    bot_id: row.bot_id ?? null,
    bot_name: row.bot_name ?? row.bot?.name ?? null,

    sl: row.sl ?? null,
    tp: row.tp ?? null,
  };
}


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

// Bots (Details & Pairs)
async function getBot(id: number): Promise<Bot> {
  const b = await http<any>(`/api/v1/bots/${id}`);
  return {
    id: b.id,
    name: b.name,
    strategy: b.strategy ?? null,
    timeframe: b.timeframe ?? null,
    tv_risk_multiplier_default: b.tv_risk_multiplier_default ?? null,
    position_mode: b.position_mode ?? null,
    margin_mode: b.margin_mode ?? null,
    default_leverage: b.default_leverage ?? null,
    status: b.status,
    auto_approve: b.auto_approve,
    uuid: b.uuid ?? null,
    secret: null,
    max_leverage: null,
    api_key: b.api_key ?? null,       // wichtig: zur Bybit-Verbindung
    api_secret: b.api_secret ?? null, // wichtig: zur Bybit-Verbindung
    is_deleted: b.is_deleted ?? false,
    created_at: b.created_at,
    updated_at: b.updated_at ?? null,
  };
}

// alle Bots des eingeloggten Users holen
async function getBots(): Promise<Bot[]> {
  const rows = await http<any[]>('/api/v1/bots');
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    strategy: b.strategy ?? null,
    timeframe: b.timeframe ?? null,
    tv_risk_multiplier_default: b.tv_risk_multiplier_default ?? null,
    position_mode: b.position_mode ?? null,
    margin_mode: b.margin_mode ?? null,
    default_leverage: b.default_leverage ?? null,
    status: b.status,
    auto_approve: b.auto_approve,
    uuid: b.uuid ?? null,
    api_key: b.api_key ?? null,
    api_secret: b.api_secret ?? null,
    secret: null,
    max_leverage: null,
    is_deleted: b.is_deleted ?? false,
    created_at: b.created_at,
    updated_at: b.updated_at ?? null,
  }));
}

async function getBotSymbols(botId: number) {
  return http<Array<{
    id: number;
    bot_id: number;
    symbol: string;
    enabled: boolean;
    target_risk_amount: number;
    leverage_override?: number | null;
  }>>(`/api/v1/bots/${botId}/symbols`);
}

async function upsertBotSymbols(botId: number, items: BotSymbolSettingIn[]) {
  return http(`/api/v1/bots/${botId}/symbols`, { method: 'PUT', body: items });
}

// Bot CRUD & Status
async function createBot(data: Partial<Bot>): Promise<Bot> {
  return http<Bot>('/api/v1/bots', { method: 'POST', body: data });
}
async function updateBot(id: number, data: Partial<Bot>): Promise<Bot> {
  return http<Bot>(`/api/v1/bots/${id}`, { method: 'PATCH', body: data });
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
async function setBotAutoApprove(bot_id: number, auto_approve: boolean) {
  return http(`/api/v1/bots/${bot_id}/auto-approve`, {
    method: 'PATCH',
    body: { auto_approve },
  });
}

// Positions / Trades
type PositionsParams = { status?: string; bot_id?: number; symbol?: string; side?: string };

async function getPositions(params?: {
  status?: 'open' | 'closed';
  bot_id?: number;
  symbol?: string;
  side?: 'long' | 'short';
}): Promise<{ items: PositionListItem[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.bot_id) qs.set('bot_id', String(params.bot_id));
  if (params?.symbol) qs.set('symbol', params.symbol);
  if (params?.side) qs.set('side', params.side);

  const url =
    qs.toString().length > 0
      ? `/api/v1/positions?${qs.toString()}`
      : `/api/v1/positions`;

  const res = await http<PositionsResponseRaw>(url);
  const rawItems = Array.isArray(res.items) ? res.items : [];
  return {
    items: rawItems.map(mapPositionRow),
  };
}


async function getPosition(id: number): Promise<PositionListItem> {
  // genau wie die anderen Endpoints
  return await http<PositionListItem>(`/api/v1/positions/${id}`);
}


async function setPositionSlTp(position_id: number, params: { sl?: number; tp?: number }) {
  return http(`/api/v1/positions/${position_id}/set-sl-tp`, { method: 'POST', body: params });
}
async function closePosition(position_id: number) {
  return http(`/api/v1/positions/${position_id}/close`, { method: 'POST' });
}

// Orders / Funding
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

// Symbols / PnL
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

async function getDailyPnl(params?: { days?: number; bot_id?: number }): Promise<PnlDailyPoint[]> {
  const rows = await http<PnlDailyRowRaw[]>('/api/v1/dashboard/daily-pnl', { query: params });
  return rows.map((r) => ({ date: r.day, pnl: r.pnl_net_usdt ?? 0 }));
}

// Outbox
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

// Verfügbare Pairs (aktuell Mock, bis echter Endpoint existiert)
async function getAvailablePairs(): Promise<Array<{ symbol: string; name: string; icon: string; base: string; quote: string; price_decimals: number; qty_decimals: number; max_leverage: number }>> {
  return http('/api/v1/pairs');
}

// --- NEU: User Webhook-Secret laden ---
async function getMyWebhookSecret(): Promise<string> {
  const r = await http<{ webhook_secret: string }>('/api/v1/me/webhook-secret');
  return r.webhook_secret;
}

// User settings
async function updateUserProfile(data: { name?: string; email?: string }): Promise<any> {
  return http('/api/v1/user/profile', { method: 'PATCH', body: data });
}
async function updateUserPassword(data: { current_password: string; new_password: string }): Promise<any> {
  return http('/api/v1/user/password', { method: 'PATCH', body: data });
}

// Timezone settings
async function updateTimezone(data: { use_system: boolean; timezone?: string }): Promise<any> {
  return http('/api/v1/user/timezone', { method: 'PATCH', body: data });
}

// Notification settings
async function getNotificationSettings(): Promise<any> {
  return http('/api/v1/user/notifications');
}
async function updateNotificationSettings(settings: any): Promise<any> {
  return http('/api/v1/user/notifications', { method: 'PATCH', body: settings });
}

// User management (admin)
async function createUser(data: { username: string; email: string; password: string; role: string }): Promise<any> {
  return http('/api/v1/users', { method: 'POST', body: data });
}

// ---------- Export-Objekt ----------

export const api = {
  // Bots
  getBot,
  getBots,
  getBotSymbols,
  upsertBotSymbols,
  createBot,
  updateBot,
  pauseBot,
  resumeBot,
  deleteBot,
  setBotAutoApprove,

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
  updateTimezone,
  getNotificationSettings,
  updateNotificationSettings,

  // Admin
  createUser,

  // User secret (NEU)
  getMyWebhookSecret,

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
