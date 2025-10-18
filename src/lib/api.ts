import type { 
  BotOut, 
  PositionOut, 
  PositionsResponse, 
  OrderOut, 
  FundingEventOut, 
  DailyPnlPoint, 
  SymbolOut 
} from '@/types/openapi';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function apiGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params)
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
    });

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// API client
export const api = {
  getBots: () => apiGet<BotOut[]>('/bots'),
  getSymbols: () => apiGet<SymbolOut[]>('/symbols'),
  getPositions: (params?: { status?: string; bot_id?: number; symbol?: string }) => 
    apiGet<PositionsResponse>('/positions', params),
  getPosition: (id: number) => apiGet<PositionOut>(`/positions/${id}`),
  getOrders: (positionId: number) => apiGet<OrderOut[]>('/orders', { position_id: positionId }),
  getFunding: (positionId: number) => apiGet<FundingEventOut[]>('/funding', { position_id: positionId }),
  getDailyPnl: (params?: { days?: number; bot_id?: number }) => 
    apiGet<DailyPnlPoint[]>('/pnl/daily', params),
};

export default api;
