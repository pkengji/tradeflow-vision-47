// src/lib/api.ts
// Einheitliche API-Schicht fürs TradingBot-Backend
// - Bewahrt Backcompat: apiRequest<T>, actions, default- und named-Export
// - Fügt robuste http-Helper + typisierte api-Methoden hinzu

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

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
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  return `${path}?${usp.toString()}`;
}

async function http<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const urlStr = `${API_BASE}${withQuery(path, opts.query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  const res = await fetch(urlStr, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
    signal: controller.signal,
    mode: "cors",
    credentials: "include",
  }).catch((e) => {
    clearTimeout(timeout);
    throw new Error(`Network error: ${e}`);
  });

  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${urlStr}: ${text}`);
  }

  if (res.status === 204) return null as unknown as T;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
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
  account_kind?: string | null;
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
  icon?: string | null;
  max_leverage?: number | null;
};

function resolveIconUrl(icon?: string | null): string | null {
  if (!icon) return null;
  // Absolute URLs (http/https) can be used directly
  if (/^https?:\/\//i.test(icon)) return icon;
  // For relative paths like "/static/icons/aave.png" we need to prefix the API base URL
  if (icon.startsWith("/")) return `${API_BASE}${icon}`;
  // Fallback: treat as relative to API base
  return `${API_BASE}/${icon}`;
}

type PositionsResponseRaw = {
  items: any[];
};


// ---------- Frontend-Typen (stabil) ----------

export type Bot = {
  id: number;
  name: string;
  user_id: number;
  uuid: string;
  description?: string | null;
  exchange?: string | null;
  account_kind?: string | null;
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
  side: "long" | "short" | null;
  status: string; // 'open' | 'closed'
  qty: number | null;
  leverage?: number | null;
  entry_price: number | null;
  entry_price_trigger?: number | null;
  entry_price_best?: number | null;
  entry_price_vwap?: number | null;
  exit_price?: number | null;
  exit_price_best?: number | null;
  exit_price_vwap?: number | null;
  mark_price?: number | null;
  sl?: number | null;
  tp?: number | null;
  pnl: number | null;
  unrealized_pnl?: number | null;
  pnl_pct?: number | null;
  fee_open_usdt?: number | null;
  fee_close_usdt?: number | null;
  funding_usdt?: number | null;
  slippage_liquidity_open?: number | null;
  slippage_liquidity_close?: number | null;
  slippage_timelag?: number | null;
  timelag_tv_to_bot?: number | null;
  timelag_bot_processing?: number | null;
  timelag_bot_to_exchange?: number | null;
  timelag_close_tv_to_bot?: number | null;
  timelag_close_bot_processing?: number | null;
  timelag_close_bot_to_exchange?: number | null;
  opened_at: string | null;
  closed_at: string | null;
  trade_uid?: string | null;
  tv_signal_id?: number | null;
  outbox_item_id?: number | null;
  first_exec_at?: string | null;
  last_exec_at?: string | null;
};

export type PnlDailyPoint = { date: string; pnl: number; equity: number };

// Aliases für bestehende Importe in Dashboard.tsx
export type DailyPnl = PnlDailyPoint;
// Gern später präzisieren, sobald /summary final ist:
export type Summary = Record<string, any>;

export type OutboxItem = {
  id: number;
  kind: string;
  status: "queued" | "approved" | "rejected" | "sent" | "failed";
  position_id: number | null;
  payload?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export type Trade = {
  id: number;
  symbol: string;
  side: "long" | "short" | "buy" | "sell";
  qty?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  mark_price?: number | null;
  sl?: number | null;
  tp?: number | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  status: "open" | "closed";
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

// Dashboard Summary Types
export type DashboardSummary = {
  portfolio_total_equity: number;
  cashflows?: {
    deposits_usdt: number;
    withdrawals_usdt: number;
    net_cashflow_usdt: number;
  };
  kpis: {
    overall: DashboardKPIPeriod;
    today: DashboardKPIPeriod;
    month: DashboardKPIPeriod;
    last_30d: DashboardKPIPeriod;
    current: {
      open_trades: number;
      win_rate: number;
    };
  };
  equity_timeseries: Array<{ ts: string; day_pnl: number }>;
};

export type DashboardKPIPeriod = {
  realized_pnl: number;
  trade_count: number;
  win_rate: number;
  tx_costs_pct: number;
  tx_breakdown_pct?: {
    fees: number;
    funding: number;
    slip_liquidity: number;
    slip_time: number;
  };
  tx_breakdown_usdt: {
    fees: number;
    funding: number;
    slip_liquidity: number;
    slip_time: number;
  };
  timelag_ms: {
    ingress_ms_avg: number;
    engine_ms_avg: number;
    tv_to_send_ms_avg: number;
    tv_to_fill_ms_avg: number;
    samples: number;
  };
};

// ---------- API-Funktionen ----------

async function getBots(): Promise<Bot[]> {
  const rows = await http<BotRow[]>("/api/v1/bots");
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    user_id: b.user_id,
    uuid: b.uuid,
    description: b.description ?? null,
    exchange: b.exchange ?? null,
    account_kind: b.account_kind ?? null,
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
}

async function pauseBot(id: number) {
  return http(`/api/v1/bots/${id}/pause`, { method: "POST" });
}
async function resumeBot(id: number) {
  return http(`/api/v1/bots/${id}/resume`, { method: "POST" });
}
async function deleteBot(id: number) {
  return http(`/api/v1/bots/${id}`, { method: "DELETE" });
}
async function getBotExchangeKeys(id: number): Promise<{ api_key_masked: string | null; has_api_secret: boolean; account_kind?: string | null }> {
  return http(`/api/v1/bots/${id}/exchange-keys`);
}
async function setBotExchangeKeys(id: number, data: { api_key: string; api_secret: string; account_kind?: string }) {
  return http(`/api/v1/bots/${id}/exchange-keys`, { method: "PUT", body: data });
}

async function getBotSymbols(bot_id: number): Promise<any[]> {
  return http(`/api/v1/bots/${bot_id}/symbols`);
}

async function setBotSymbols(bot_id: number, symbols: any[]): Promise<any[]> {
  return http(`/api/v1/bots/${bot_id}/symbols`, { method: "PUT", body: symbols });
}

async function setBotAutoApprove(bot_id: number, auto_approve: boolean) {
  return http(`/api/v1/bots/${bot_id}/auto-approve`, {
    method: "PATCH",
    body: { auto_approve },
  });
}

type PositionsParams = {
  status?: string;
  bot_id?: number;
  symbol?: string;
  side?: string;
  skip?: number;
  limit?: number;
};

async function getPositions(params?: PositionsParams): Promise<{ items: PositionListItem[]; total: number }> {
  const res = await http<{ items: any[]; total: number; page: number; page_size: number }>("/api/v1/positions", {
    query: params,
  });
  const items = (res.items ?? []).map(
    (p: any): PositionListItem => ({
      id: p.id,
      bot_id: p.bot_id,
      bot_name: p.bot_name ?? null,
      symbol: p.symbol,
      side: p.side ?? null,
      status: p.status,
      qty: p.qty ?? null,
      leverage: p.leverage ?? null,
      entry_price: p.entry_price ?? null,
      entry_price_trigger: p.entry_price_trigger ?? null,
      entry_price_best: p.entry_price_best ?? null,
      entry_price_vwap: p.entry_price_vwap ?? null,
      exit_price: p.exit_price ?? null,
      exit_price_best: p.exit_price_best ?? null,
      exit_price_vwap: p.exit_price_vwap ?? null,
      mark_price: p.mark_price ?? null,
      sl: p.sl_price ?? null,
      tp: p.tp_price ?? null,
      pnl: p.pnl ?? null,
      unrealized_pnl: p.unrealized_pnl ?? null,
      pnl_pct: p.pnl_pct ?? null,
      fee_open_usdt: p.fee_open_usdt ?? null,
      fee_close_usdt: p.fee_close_usdt ?? null,
      funding_usdt: p.funding_usdt ?? null,
      slippage_liquidity_open: p.slippage_liquidity_open ?? null,
      slippage_liquidity_close: p.slippage_liquidity_close ?? null,
      slippage_timelag: p.slippage_timelag ?? null,
      timelag_tv_to_bot: p.timelag_tv_to_bot ?? null,
      timelag_bot_processing: p.timelag_bot_processing ?? null,
      timelag_bot_to_exchange: p.timelag_bot_to_exchange ?? null,
      timelag_close_tv_to_bot: p.timelag_close_tv_to_bot ?? null,
      timelag_close_bot_processing: p.timelag_close_bot_processing ?? null,
      timelag_close_bot_to_exchange: p.timelag_close_bot_to_exchange ?? null,
      opened_at: p.opened_at ?? null,
      closed_at: p.closed_at ?? null,
      trade_uid: p.trade_uid ?? null,
      tv_signal_id: p.tv_signal_id ?? null,
      outbox_item_id: p.outbox_item_id ?? null,
      first_exec_at: p.first_exec_at ?? null,
      last_exec_at: p.last_exec_at ?? null,
    }),
  );
  return { items, total: res.total ?? 0 };
}

async function getPosition(id: number): Promise<any> {
  return await http<any>(`/api/v1/positions/${id}`);
}

async function setPositionSlTp(position_id: number, params: { sl?: number; tp?: number }) {
  return http(`/api/v1/positions/${position_id}/set-sl-tp`, { method: "POST", body: params });
}

async function closePosition(position_id: number) {
  return http(`/api/v1/positions/${position_id}/close`, { method: "POST" });
}

async function getOrders(position_id: number): Promise<any[]> {
  return await http<any[]>("/api/v1/orders", { query: { position_id } });
}

async function getFunding(position_id: number): Promise<any[]> {
  return await http<any[]>("/api/v1/funding", { query: { position_id } });
}

async function getSymbols(): Promise<string[]> {
  const rows = await http<SymbolRow[]>("/api/v1/symbols");
  return rows.map((s) => s.symbol ?? (s as any).name ?? String(s));
}

async function getPairs(): Promise<SymbolRow[]> {
  return http<SymbolRow[]>("/api/v1/pairs");
}

async function getDailyPnl(params?: {
  days?: number;
  bot_id?: number;
  bot_ids?: string;
  symbols?: string;
  direction?: string;
  date_from?: string;
  date_to?: string;
  open_hour?: string;
  close_hour?: string;
}): Promise<PnlDailyPoint[]> {
  // Backend liefert inzwischen { date, pnl, equity } – zur Sicherheit auch alte Keys unterstützen
  const rows = await http<
    Array<{
      date?: string;
      day?: string;
      pnl?: number;
      pnl_net_usdt?: number;
      equity?: number;
    }>
  >("/api/v1/dashboard/daily-pnl", { query: params });

  if (!rows || rows.length === 0) return [];

  // Helper für Datums-Handling in UTC, um Off-by-one zu vermeiden
  const parseISODateUTC = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  };

  const formatISODateUTC = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const round2 = (n: number): number => Math.round(n * 100) / 100;

  // 1) Normalisieren: Backend → { date, pnl, equity }
  const normalized = rows
    .map((r) => {
      const date = r.date ?? r.day;
      if (!date) return null;

      const rawPnl = r.pnl ?? r.pnl_net_usdt ?? 0;
      const rawEquity = r.equity ?? 0;

      return {
        date,
        pnl: typeof rawPnl === "number" ? rawPnl : Number(rawPnl) || 0,
        equity: typeof rawEquity === "number" ? rawEquity : Number(rawEquity) || 0,
      };
    })
    .filter((r): r is { date: string; pnl: number; equity: number } => r !== null);

  if (normalized.length === 0) return [];

  // 2) Nach Datum sortieren
  normalized.sort((a, b) => a.date.localeCompare(b.date));

  // 3) Lücken füllen: vom ersten bis zum letzten Datum durchiterieren
  const start = parseISODateUTC(normalized[0].date);
  const end = parseISODateUTC(normalized[normalized.length - 1].date);

  const result: PnlDailyPoint[] = [];
  let idx = 0;
  let prevEquity = 0;

  for (let d = new Date(start.getTime()); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayStr = formatISODateUTC(d);
    const current = normalized[idx] && normalized[idx].date === dayStr ? normalized[idx] : null;

    if (current) {
      const pnlRounded = round2(current.pnl);
      const equityRounded = round2(current.equity);
      prevEquity = equityRounded;

      result.push({
        date: dayStr,
        pnl: pnlRounded,
        equity: equityRounded,
      });

      idx += 1;
    } else {
      // Kein Eintrag für diesen Tag → Equity carry-forward, PnL = 0
      result.push({
        date: dayStr,
        pnl: 0,
        equity: round2(prevEquity),
      });
    }
  }

  return result;
}

async function getOutbox(params?: { status?: string; limit?: number }): Promise<OutboxItem[]> {
  return http<OutboxItem[]>("/api/v1/outbox", { query: params });
}
async function approveOutbox(id: number): Promise<OutboxItem> {
  return http<OutboxItem>(`/api/v1/outbox/${id}/approve`, { method: "POST" });
}
async function rejectOutbox(id: number): Promise<OutboxItem> {
  return http<OutboxItem>(`/api/v1/outbox/${id}/reject`, { method: "POST" });
}
async function previewOutbox(id: number): Promise<any> {
  return http(`/api/v1/outbox/${id}/preview`);
}

async function logAction(event: string, payload?: any): Promise<null | any> {
  return http("/api/v1/client-log", {
    method: "POST",
    body: { event, payload, ts: new Date().toISOString() },
  });
}

// Bot management
async function createBot(data: Partial<Bot>): Promise<Bot> {
  return http<Bot>("/api/v1/bots", { method: "POST", body: data });
}

async function syncBotBybit(botId: number): Promise<void> {
  return http<void>(`/api/v1/bots/${botId}/sync-bybit`, { method: "POST" });
}

async function updateBot(id: number, data: Partial<Bot>): Promise<Bot> {
  return http<Bot>(`/api/v1/bots/${id}`, { method: "PATCH", body: data });
}

// Auth
async function login(credentials: { email?: string; username?: string; password: string }): Promise<any> {
  return http("/api/v1/auth/login", { method: "POST", body: credentials });
}

async function logout(): Promise<any> {
  return http("/api/v1/auth/logout", { method: "POST" });
}

async function getMe(): Promise<any> {
  return http("/api/v1/me");
}

// User settings
async function updateUserProfile(data: { username?: string; email?: string }): Promise<any> {
  return http("/api/v1/me", { method: "PATCH", body: data });
}

async function updateUserPassword(data: { new_password: string }): Promise<any> {
  return http("/api/v1/me/password", { method: "POST", body: data });
}

async function getWebhookSecret(): Promise<{ webhook_secret: string }> {
  return http("/api/v1/me/webhook-secret");
}

async function rotateWebhookSecret(): Promise<{ webhook_secret: string }> {
  return http("/api/v1/me/webhook-secret/rotate", { method: "POST" });
}

// Timezone settings (placeholder until backend implements)
async function updateTimezone(data: { use_system: boolean; timezone?: string }): Promise<any> {
  console.warn("updateTimezone not yet implemented in backend");
  return Promise.resolve({ ok: true });
}

// Notification settings (placeholder until backend implements)
async function getNotificationSettings(): Promise<any> {
  console.warn("getNotificationSettings not yet implemented in backend");
  return Promise.resolve({});
}

async function updateNotificationSettings(settings: any): Promise<any> {
  console.warn("updateNotificationSettings not yet implemented in backend");
  return Promise.resolve({ ok: true });
}

// Dashboard
async function getDashboardSummary(params?: {
  bot_ids?: string;
  symbols?: string;
  direction?: string;
  date_from?: string;
  date_to?: string;
  open_hour?: string;
  close_hour?: string;
}): Promise<DashboardSummary> {
  return http("/api/v1/dashboard/summary", { query: params });
}

// User management (admin)
async function createUser(data: { username: string; email: string; password: string; role?: string }): Promise<any> {
  return http("/api/v1/users", { method: "POST", body: data });
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
  syncBotBybit,
  updateBot,
  pauseBot,
  resumeBot,
  deleteBot,
  setBotAutoApprove,
  getBotExchangeKeys,
  setBotExchangeKeys,
  getBotSymbols,
  setBotSymbols,

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
  getPairs,
  getDailyPnl,
  resolveIconUrl,

  // Dashboard
  getDashboardSummary,

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
  updateTimezone,
  getNotificationSettings,
  updateNotificationSettings,

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
  opts: { method?: string; body?: any; headers?: Record<string, string> } = {},
): Promise<T> {
  return http<T>(path, {
    method: (opts.method ?? "GET") as any,
    body: opts.body,
    headers: opts.headers,
  });
}

// Legacy-Pfade beibehalten, falls irgendwo noch verwendet:
async function legacySetTpSl(positionId: number, payload: { tp: number | null; sl: number | null }) {
  return apiRequest(`/api/v1/trades/${positionId}/set-tp-sl`, { method: "POST", body: payload });
}
async function legacyClosePosition(positionId: number) {
  return apiRequest(`/api/v1/trades/${positionId}/close`, { method: "POST" });
}

export const actions = {
  setTpSl: legacySetTpSl, // alte Signatur/Pfad intakt
  closePosition: legacyClosePosition,
};
