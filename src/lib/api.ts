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
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 15000
  );

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
    // Netzwerk-/CORS-/Timeout-Fehler besser lesbar machen
    throw new Error(`Network error fetching ${url.toString()}: ${e}`);
  });

  clearTimeout(timeout);

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} for ${url.pathname}: ${text || r.statusText}`);
  }

  // Einige Endpunkte liefern evtl. kein JSON (204). Dann einfach "null" zurückgeben.
  if (r.status === 204) return null as unknown as T;

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // Falls Backend text/csv o.ä. liefert: gib Text roh durch
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
  // (dein Backend liefert aktuell keine uuid/secret/max_leverage – wir mappen sie unten auf null)
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
  uuid: string | null;
  secret: string | null;
  max_leverage: number | null;
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

// ---------- API-Funktionen (mit Mapping) ----------

async function getBots(): Promise<Bot[]> {
  const rows = await http<BotRow[]>('/bots');
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    strategy: b.strategy ?? null,
    timeframe: b.timeframe ?? null,
    tv_risk_multiplier_default: b.tv_risk_multiplier_default ?? null,
    uuid: null,          // Backend liefert aktuell keines -> im UI wird "—" gezeigt
    secret: null,
    max_leverage: null,
  }));
}

async function getSymbols(): Promise<string[]> {
  const rows = await http<SymbolRow[]>('/symbols');
  // UI kann Strings – wir geben die Symbolstrings zurück
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
    bot_name: p.bot_name ?? null, // dein Backend liefert kein bot_name -> bleibt null
    opened_at: p.opened_at ?? null,
    closed_at: p.closed_at ?? null,
    pnl: p.realized_pnl_net_usdt ?? null, // WICHTIG: Mapping
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
    date: r.day,                  // WICHTIG: Mapping
    pnl: r.pnl_net_usdt ?? 0,     // WICHTIG: Mapping
  }));
}

// ---------- Export ----------

export const api = {
  getBots,
  getSymbols,
  getPositions,
  getPosition,
  getOrders,
  getFunding,
  getDailyPnl,
};

export default api;
