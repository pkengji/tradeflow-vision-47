// Central formatting utilities for consistent display across the app

/**
 * Format currency with 2 decimal places and Swiss formatting
 * @param value - The value to format
 * @param showSign - Whether to show +/- sign
 */
export function formatCurrency(value: number | null | undefined, showSign = false): string {
  if (value == null) return '—';
  const formatted = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const withSign = showSign && value >= 0 ? `+${formatted}` : formatted;
  return `$ ${withSign}`;
}

/**
 * Format percentage with 2 decimal places
 * @param value - The value to format (as decimal, e.g., 0.15 for 15%)
 * @param showSign - Whether to show +/- sign
 */
export function formatPercent(value: number | null | undefined, showSign = false): string {
  if (value == null) return '—';
  const pct = (value * 100).toFixed(2);
  return showSign && value >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Format price with 2 decimal places
 * @param value - The price to format
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

/**
 * Format milliseconds as readable string
 */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms}ms`;
}

/**
 * Format price based on tick size (dynamic decimal places)
 * @param value - The price to format
 * @param tickSize - The tick size (e.g., 0.01, 0.0001)
 */
export function formatPriceByTickSize(value: number | null | undefined, tickSize?: number | string | null): string {
  if (value == null) return '—';
  
  // Determine decimal places from tick size
  let decimals = 2; // default
  if (tickSize != null) {
    const ts = typeof tickSize === 'string' ? parseFloat(tickSize) : tickSize;
    if (!isNaN(ts) && ts > 0) {
      const tsStr = ts.toString();
      const decimalIndex = tsStr.indexOf('.');
      if (decimalIndex >= 0) {
        decimals = tsStr.length - decimalIndex - 1;
      }
    }
  }
  
  return `$ ${value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

/**
 * Format date as DD.MM.YYYY
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format datetime as DD.MM.YYYY HH:MM:SS
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
