// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Typen
type Summary = {
  portfolio_total: number;           // ungefiltert (exkl. unrealized P&L)
  pnl_today: number;                 // realized heute
  winrate_today: number;             // 0..1
  open_trades_count: number;
  portfolio_filtered: number;        // nach Filtern
  winrate_filtered: number;          // 0..1, nach Filtern
  fees_pct_filtered: number;         // gesamt in %
  slippage_liq_pct_filtered: number;
  slippage_time_pct_filtered: number;
  fees_pct_filtered_total: number;   // Summe aller Transaktionskosten
  timelag_tv_to_bot_ms_filtered: number;
  timelag_bot_to_ex_ms_filtered: number;
  fees_pct_today: number;
  slippage_liq_pct_today: number;
  slippage_time_pct_today: number;
  fees_pct_today_total: number;
  timelag_tv_to_bot_ms_today: number;
  timelag_bot_to_ex_ms_today: number;
  mtd: { pnl: number; winrate: number; fees_pct: number; slippage_liq_pct: number; slippage_time_pct: number; fees_pct_total: number; timelag_tv_to_bot_ms: number; timelag_bot_to_ex_ms: number };
  last30d: { pnl: number; winrate: number; fees_pct: number; slippage_liq_pct: number; slippage_time_pct: number; fees_pct_total: number; timelag_tv_to_bot_ms: number; timelag_bot_to_ex_ms: number };
};

type DailyPnl = { date: string; pnl: number; equity: number };

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<DailyPnl[]>([]);
  const [filters, setFilters] = useState<TradesFilters>({
    botIds: [],
    symbols: [],
    side: 'all',
    dateFrom: undefined,
    dateTo: undefined,
    timeFrom: undefined,
    timeTo: undefined,
    timeMode: 'opened',
  });
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);

  // Bots & Symbols laden
  useEffect(() => {
    (async () => {
      try {
        const botsList = await api.getBots();
        setBots(botsList.map((b: any) => ({ id: b.id, name: b.name })));
      } catch {}
      try {
        const symbolsList = await api.getSymbols();
        setSymbols(symbolsList);
      } catch {}
    })();
  }, []);

  // Daten laden (einfacher Fetch, kein React Query nötig)
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.botIds.length) qs.set('bot_ids', filters.botIds.join(','));
    if (filters.symbols.length) qs.set('symbols', filters.symbols.join(','));
    if (filters.dateFrom) qs.set('from', filters.dateFrom.toISOString().split('T')[0]);
    if (filters.dateTo) qs.set('to', filters.dateTo.toISOString().split('T')[0]);
    if (filters.timeFrom) qs.set('time_from', filters.timeFrom);
    if (filters.timeTo) qs.set('time_to', filters.timeTo);

    (async () => {
      try {
        const s = await apiRequest<Summary>(`/api/v1/dashboard/summary?${qs.toString()}`);
        setSummary(s);
      } catch {
        // Stub, falls Endpoint noch nicht fertig ist
        setSummary({
          portfolio_total: 12345.67,
          pnl_today: 120.55,
          winrate_today: 0.62,
          open_trades_count: 3,
          portfolio_filtered: 9876.54,
          winrate_filtered: 0.58,
          fees_pct_filtered: 0.8,
          slippage_liq_pct_filtered: 0.5,
          slippage_time_pct_filtered: 0.3,
          fees_pct_filtered_total: 1.6,
          timelag_tv_to_bot_ms_filtered: 180,
          timelag_bot_to_ex_ms_filtered: 90,
          fees_pct_today: 0.9,
          slippage_liq_pct_today: 0.6,
          slippage_time_pct_today: 0.4,
          fees_pct_today_total: 1.9,
          timelag_tv_to_bot_ms_today: 200,
          timelag_bot_to_ex_ms_today: 100,
          mtd: { pnl: 850.12, winrate: 0.61, fees_pct: 0.8, slippage_liq_pct: 0.5, slippage_time_pct: 0.3, fees_pct_total: 1.6, timelag_tv_to_bot_ms: 190, timelag_bot_to_ex_ms: 95 },
          last30d: { pnl: 1230.5, winrate: 0.59, fees_pct: 0.9, slippage_liq_pct: 0.6, slippage_time_pct: 0.4, fees_pct_total: 1.9, timelag_tv_to_bot_ms: 210, timelag_bot_to_ex_ms: 105 },
        });
      }

      try {
        const d = await apiRequest<DailyPnl[]>(`/api/v1/dashboard/daily-pnl?${qs.toString()}`);
        setSeries(d);
      } catch {
        // Stub-Serie
        const today = new Date();
        const mock = Array.from({ length: 30 }, (_, i) => {
          const dt = new Date(today);
          dt.setDate(today.getDate() - (29 - i));
          return { date: dt.toISOString().slice(0, 10), pnl: Math.round((Math.random() - 0.4) * 200), equity: 10000 + i * 50 + Math.random() * 100 };
        });
        setSeries(mock);
      }
    })();
  }, [filters]);

  // Prüfen ob Zeitfilter aktiv
  const hasTimeFilter = !!(filters.timeFrom || filters.timeTo);


  return (
    <div className="space-y-4">
      {/* Filterzeile */}
      <div className="flex justify-end">
        <TradesFiltersBar
          value={filters}
          onChange={setFilters}
          availableBots={bots}
          availableSymbols={symbols}
          showDateRange={true}
          showTimeRange={true}
          showSignalKind={false}
        />
      </div>

      {/* 1. Portfoliowert total - ungefiltert, groß */}
      {summary && (
        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Portfoliowert Total</div>
              <div className="text-4xl font-bold">{currency(summary.portfolio_total)}</div>
              <div className="text-xs text-muted-foreground mt-1">exkl. unrealized P&L</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. Gesamtview (gefiltert) */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gesamtansicht (gefiltert)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Portfoliowert</span>
              <span className="font-semibold">{currency(summary.portfolio_filtered)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-semibold">{pct(summary.winrate_filtered)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Transaktionskosten Total</span>
              <span className="font-semibold">{pct(summary.fees_pct_filtered_total)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Fees</span>
              <span className="font-semibold text-xs">{pct(summary.fees_pct_filtered)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Liquidität)</span>
              <span className="font-semibold text-xs">{pct(summary.slippage_liq_pct_filtered)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Timelag)</span>
              <span className="font-semibold text-xs">{pct(summary.slippage_time_pct_filtered)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag TV→Bot</span>
              <span className="font-semibold">{ms(summary.timelag_tv_to_bot_ms_filtered)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag Bot→Exchange</span>
              <span className="font-semibold">{ms(summary.timelag_bot_to_ex_ms_filtered)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Heute (nur wenn kein Zeitfilter aktiv) */}
      {summary && !hasTimeFilter && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Heute</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <Link to="/trades?status=closed" className="flex flex-col hover:opacity-80 transition-opacity">
              <span className="text-muted-foreground">P&L realized heute</span>
              <span className="font-semibold flex items-center gap-1">
                {currency(summary.pnl_today)}
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Win Rate heute</span>
              <span className="font-semibold">{pct(summary.winrate_today)}</span>
            </div>
            <Link to="/trades?status=open" className="flex flex-col hover:opacity-80 transition-opacity">
              <span className="text-muted-foreground">Offene Trades aktuell</span>
              <span className="font-semibold flex items-center gap-1">
                {summary.open_trades_count}
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Transaktionskosten Total</span>
              <span className="font-semibold">{pct(summary.fees_pct_today_total)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Fees</span>
              <span className="font-semibold text-xs">{pct(summary.fees_pct_today)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Liquidität)</span>
              <span className="font-semibold text-xs">{pct(summary.slippage_liq_pct_today)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Timelag)</span>
              <span className="font-semibold text-xs">{pct(summary.slippage_time_pct_today)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag TV→Bot</span>
              <span className="font-semibold">{ms(summary.timelag_tv_to_bot_ms_today)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag Bot→Exchange</span>
              <span className="font-semibold">{ms(summary.timelag_bot_to_ex_ms_today)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Aktueller Monat */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Aktueller Monat</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Realized P&L</span>
              <span className="font-semibold">{currency(summary.mtd.pnl)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-semibold">{pct(summary.mtd.winrate)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Transaktionskosten Total</span>
              <span className="font-semibold">{pct(summary.mtd.fees_pct_total)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Fees</span>
              <span className="font-semibold text-xs">{pct(summary.mtd.fees_pct)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Liquidität)</span>
              <span className="font-semibold text-xs">{pct(summary.mtd.slippage_liq_pct)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Timelag)</span>
              <span className="font-semibold text-xs">{pct(summary.mtd.slippage_time_pct)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag TV→Bot</span>
              <span className="font-semibold">{ms(summary.mtd.timelag_tv_to_bot_ms)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag Bot→Exchange</span>
              <span className="font-semibold">{ms(summary.mtd.timelag_bot_to_ex_ms)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Letzte 30 Tage */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Letzte 30 Tage</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Realized P&L</span>
              <span className="font-semibold">{currency(summary.last30d.pnl)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-semibold">{pct(summary.last30d.winrate)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Transaktionskosten Total</span>
              <span className="font-semibold">{pct(summary.last30d.fees_pct_total)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Fees</span>
              <span className="font-semibold text-xs">{pct(summary.last30d.fees_pct)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Liquidität)</span>
              <span className="font-semibold text-xs">{pct(summary.last30d.slippage_liq_pct)}</span>
            </div>
            <div className="flex flex-col pl-4">
              <span className="text-muted-foreground text-xs">• Slippage (Timelag)</span>
              <span className="font-semibold text-xs">{pct(summary.last30d.slippage_time_pct)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag TV→Bot</span>
              <span className="font-semibold">{ms(summary.last30d.timelag_tv_to_bot_ms)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Timelag Bot→Exchange</span>
              <span className="font-semibold">{ms(summary.last30d.timelag_bot_to_ex_ms)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Equity-Chart (nur nach Datumsrange filterbar) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portfoliowert / Tages-P&L</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis yAxisId="left" className="text-xs" />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: any, name: string) => {
                  if (name === 'equity') return [currency(value), 'Portfoliowert'];
                  if (name === 'pnl') return [currency(value), 'P&L'];
                  return [value, name];
                }}
              />
              <Line yAxisId="left" type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// Format-Helper
function currency(
  value: number | null | undefined,
  currencyCode: string = 'USD',
  locale: string = 'de-CH'
) {
  const n =
    typeof value === 'number' && isFinite(value)
      ? value
      : typeof value === 'string' && !isNaN(parseFloat(value))
      ? parseFloat(value)
      : 0;

  try {
    return n.toLocaleString(locale, { style: 'currency', currency: currencyCode });
  } catch {
    return `${n.toFixed(2)} ${currencyCode}`;
  }
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && isFinite(v)
    ? v
    : typeof v === 'string' && !isNaN(parseFloat(v))
    ? parseFloat(v)
    : fallback;

function pct(v: number | string | null | undefined) {
  const n = num(v, 0);          // 0..1 oder 0..100
  const x = n > 1 ? n : n * 100;
  return `${x.toFixed(1)}%`;
}

function ms(x: number | string | null | undefined) {
  const n = Math.round(num(x, 0));
  return `${n} ms`;
}