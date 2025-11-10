// src/lib/symbols.ts
// Utilities for symbol metadata and icons
import { apiRequest } from '@/lib/api';

export type SymbolInfo = {
  symbol: string;
  max_leverage?: number;
  tick_size?: number | string | null;
  step_size?: number | string | null;
  base_currency?: string | null;
  quote_currency?: string | null;
  icon_url?: string | null;
  icon_local_path?: string | null;
};

export async function getAllSymbols(): Promise<SymbolInfo[]> {
  const rows = await apiRequest<any[]>('/api/v1/symbols/all');
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => {
    if (typeof r === 'string') {
      return { symbol: r } as SymbolInfo;
    }
    return {
      symbol: r.symbol || r.name || String(r),
      max_leverage: r.max_leverage ?? r.maxLeverage,
      tick_size: r.tick_size ?? r.tickSize ?? null,
      step_size: r.step_size ?? r.stepSize ?? null,
      base_currency: r.base_currency ?? r.baseCurrency ?? null,
      quote_currency: r.quote_currency ?? r.quoteCurrency ?? null,
      icon_url: r.icon_url ?? r.icon ?? null,
      icon_local_path: r.icon_local_path ?? r.iconLocalPath ?? null,
    } as SymbolInfo;
  });
}
