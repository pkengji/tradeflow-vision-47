// src/lib/api.ts
// Einheitliche API-Schicht für das TradingBot-Backend
// - passt Feldnamen deines Backends an das Frontend an
// - liefert stabile, typisierte Helper
// - exportiert sowohl "api" (named) als auch default

const BASE_URL =
  (import.meta as any)?.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface FetchOpts {
  method?: HttpMethod;
  query?: Record<string, any>;
  body?: any;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

// ---------- generische Helpers ----------

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
  const url = new URL(withQuery(path, opts.query), BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  const r = await fetch(url, {
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
  }).catch((e) => {
    clearTimeout(timeout);
    throw new Error(`Network error fetching ${url.toString()}: ${e}`);
  });

  clearTimeout(timeout);

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} for ${url.pathname}: ${text || r.statusText}`);
  }

  if (r.status === 204) return null as unknown as T;

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const t = await r.text();
    return t as unknown as T;
  }

  return (await r.json()) as T;
}

// ---------- Roh-Response-Typen vom Backend ----------

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
  day: string;            // z.B. "2025-10-16"
  pnl_net_usdt: number;   // Backend-Feldname
};

// ---------- Normalisierte Frontend-Typen ----------

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
  secret: string | null;
  max_leverage: number | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string | null;
};

export type PositionListItem = {
  id: number;
  symbol: string;
  side: 'long' | 'short';
  status: string;
  entry_price: number | null;
  qty: number | null;
  bot_name: string | null;
  opened_at: string | null;
  closed_at: string | null;
  pnl: number | null; // mapped aus realized_pnl_net_usdt
};

export type PnlDailyPoint = {
  date: string; // mapped aus "day"
  pnl: number;  // mapped aus "pnl_net_usdt"
};

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
  opened_at: string;       // ISO Datum
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

// ---------- API-Funktionen (mit Mapping) ----------

async function getBots(): Promise<Bot[]> {
  const rows = await http<BotRow[]>('/bots');
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
    uuid: null,
    secret: null,
    max_leverage: null,

    is_deleted: b.is_deleted ?? false,
    created_at: b.created_at,
    updated_at: b.updated_at ?? null,
  }));
}

async function getSymbols(): Promise<string[]> {
  const rows = await http<SymbolRow[]>('/symbols');
  return rows.map((s) => s.symbol ?? (s as any).name ?? String(s));
}

async function getPositions(params?: {
  status?: string;
  bot_id?: number;
  symbol?: string;
}): Promise<{ items: PositionListItem[] }> {
  const res = await http<PositionsResponseRaw>('/positions', { query: params });
  const items = (res.items ?? []).map((p: any): PositionListItem => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    status: p.status,
    entry_price: p.entry_price ?? null,
    qty: p.qty ?? p.tv_qty ?? null,
    bot_name: p.bot_name ?? null,
    opened_at: p.opened_at ?? null,
    closed_at: p.closed_at ?? null,
    pnl: p.realized_pnl_net_usdt ?? null,
  }));
  return { items };
}

async function getPosition(id: number): Promise<any> {
  return http<any>(`/positions/${id}`);
}

async function getOrders(position_id: number): Promise<any[]> {
  return http<any[]>('/orders', { query: { position_id } });
}

async function getFunding(position_id: number): Promise<any[]> {
  return http<any[]>('/funding', { query: { position_id } });
}

async function getDailyPnl(params?: { days?: number; bot_id?: number }): Promise<PnlDailyPoint[]> {
  const rows = await http<PnlDailyRowRaw[]>('/pnl/daily', { query: params });
  return rows.map((r) => ({
    date: r.day,
    pnl: r.pnl_net_usdt ?? 0,
  }));
}

type ClientLogEvent = {
  event: string;
  payload?: any;
  ts?: string;
};

async function logAction(event: string, payload?: any): Promise<null | any> {
  return http('/client-log', {
    method: 'POST',
    body: { event, payload, ts: new Date().toISOString() } as ClientLogEvent,
  });
}

async function getOutbox(params?: { status?: string; limit?: number }): Promise<OutboxItem[]> {
  return http<OutboxItem[]>('/outbox', { query: params });
}
async function approveOutbox(id: number): Promise<OutboxItem> {
  return http<OutboxItem>(`/outbox/${id}/approve`, { method: 'POST' });
}
async function rejectOutbox(id: number): Promise<OutboxItem> {
  return http<OutboxItem>(`/outbox/${id}/reject`, { method: 'POST' });
}
async function previewOutbox(id: number): Promise<any> {
  return http(`/outbox/${id}/preview`);
}

async function setBotAutoApprove(bot_id: number, auto_approve: boolean) {
  return http(`/bots/${bot_id}/auto-approve`, {
    method: 'PATCH',
    body: { auto_approve },
  });
}

// === Trades ===
export async function getTrades(params: {
  status: 'open' | 'closed';
  page?: number;
  page_size?: number;
  symbol?: string;
  side?: string;
  bot_id?: number;
  sort?: string; // z. B. "-opened_at", "pnl"
}): Promise<TradesResponse> {
  // 1) Backend holen (PositionsResponse) – dein Endpoint existiert schon:
  const res = await http<{ items: any[] }>('/positions', {
    query: {
      status: params.status,                    // 'open' | 'closed'
      symbol: params.symbol,
      bot_id: params.bot_id,
      // side kennt dein /positions bereits; wenn nicht, filtern wir unten clientseitig
      side: params.side,
    },
  });

  const mapped = (res.items ?? []).map((p: any) => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,                             // 'long' | 'short'
    qty: p.qty ?? p.tv_qty ?? null,
    entry_price: p.entry_price ?? null,
    exit_price: p.exit_price ?? null,
    mark_price: null,                         // falls du eins hast, setz es hier
    sl: p.sl_trigger ?? null,                 // 🔁 Mapping
    tp: p.tp_trigger ?? null,                 // 🔁 Mapping
    pnl: p.realized_pnl_net_usdt ?? null,
    pnl_pct: null,                            // falls du später berechnest
    status: p.status,                         // 'open' | 'closed'
    opened_at: p.opened_at ?? null,
    closed_at: p.closed_at ?? null,
    bot_id: p.bot_id ?? null,
    bot_name: p.bot_name ?? (p.bot_id ? `Bot #${p.bot_id}` : null),
    // optional analytics – wenn du sie irgendwann hast:
    timelag_ms: p.timelag_ms ?? null,
    slippage_bp: p.slippage_bp ?? null,
    fees_usdt: ((p.entry_fee_total_usdt ?? 0) + (p.exit_fee_total_usdt ?? 0)) || null,
  }));

  // 3) clientseitiges Filtern (falls Backend side nicht filtert)
  let items = mapped;
  if (params.side) items = items.filter(t => t.side === params.side);
  if (params.symbol) items = items.filter(t => t.symbol === params.symbol);

  // 4) Sortierung (Whitelist)
  const sortKey = (params.sort ?? '-opened_at').replace(/^-/, '');
  const desc = (params.sort ?? '-opened_at').startsWith('-');
  const keyFn: Record<string, (t: any) => any> = {
    opened_at: t => t.opened_at ?? '',
    closed_at: t => t.closed_at ?? '',
    pnl:       t => t.pnl ?? -Infinity,
    symbol:    t => t.symbol ?? '',
    side:      t => t.side ?? '',
  };
  const getter = keyFn[sortKey] ?? keyFn.opened_at;
  items = items.sort((a, b) => {
    const av = getter(a), bv = getter(b);
    return (av > bv ? 1 : av < bv ? -1 : 0) * (desc ? -1 : 1);
  });

  // 5) Pagination clientseitig
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.page_size ?? 25);
  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return { items: paged, total, page, page_size: pageSize };
}

// ---------- NEU: Aktionen (POST) ----------

/** Position schließen (expects 200/204). */
async function closePosition(position_id: number): Promise<null | any> {
  // Pfad ggf. an dein Backend anpassen:
  return http(`/positions/${position_id}/close`, { method: 'POST' });
}

/** SL/TP für Position setzen. Body-Felder optional. */
async function setPositionSlTp(position_id: number, params: { sl?: number; tp?: number }): Promise<null | any> {
  return http(`/positions/${position_id}/set-sl-tp`, {
    method: 'POST',
    body: params,
  });
}

// ---------- Export ----------

export const api = {
  // GETs
  getBots,
  getSymbols,
  getPositions,
  getPosition,
  getOrders,
  getFunding,
  getDailyPnl,
  closePosition,
  setPositionSlTp,
  logAction,
  getOutbox,
  approveOutbox,
  rejectOutbox,
  previewOutbox,
  setBotAutoApprove,
};

export default api;
