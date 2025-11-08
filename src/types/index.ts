export type Position = {
  id: string | number
  symbol: string
  side: 'Long' | 'Short'
  qty: number
  entry_price: number
  mark_price: number
  pnl_usd: number
  pnl_pct?: number
  updated_at?: string
  spark?: number[]   // optional – Mini-Zeitreihe für Sparkline
}
