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

// Simple in-memory cache for symbol info
let symbolCache: Map<string, SymbolInfo> | null = null;

export async function getAllSymbols(): Promise<SymbolInfo[]> {
  console.log('[getAllSymbols] Starting fetch...');
  const rows = await apiRequest<any[]>('/api/v1/symbols/all');
  console.log('[getAllSymbols] Received data:', Array.isArray(rows) ? rows.length : 'non-array');

  if (!Array.isArray(rows)) {
    console.warn('[getAllSymbols] Response is not an array:', rows);
    return [];
  }
  
  const infos = rows.map((r: any) => {
    if (typeof r === 'string') {
      return { symbol: r } as SymbolInfo;
    }
    return {
      symbol: r.symbol || r.name || String(r),
      max_leverage: r.max_leverage ?? r.maxLeverage,
      tick_size: r.tick_size ?? r.tickSize ?? null,
      step_size: r.step_size ?? r.stepSize ?? null,
      base_currency: r.base_currency ?? r.baseCurrency ?? r.base ?? null,
      quote_currency: r.quote_currency ?? r.quoteCurrency ?? r.quote ?? null,
      icon_url: r.icon_url ?? r.icon ?? null,
      icon_local_path: r.icon_local_path ?? r.iconLocalPath ?? null,
    } as SymbolInfo;
  });
  
  // Update cache
  symbolCache = new Map();
  for (const info of infos) {
    symbolCache.set(info.symbol, info);
  }
  
  console.log('[getAllSymbols] Successfully cached', infos.length, 'symbols');
  return infos;
}

/**
 * Get cached symbol info (call getAllSymbols first to populate cache)
 */
export function getSymbolInfo(symbol: string): SymbolInfo | null {
  return symbolCache?.get(symbol) ?? null;
}
