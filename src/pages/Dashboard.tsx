// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Typen
type Summary = {
  portfolio_total: number;           // ungefiltert (realized P&L total / Proxy)
  pnl_today: number;                 // realized heute
  winrate_today: number;             // 0..1
  open_trades_count: number;
  portfolio_filtered: number;        // nach Filtern
  winrate: number;                   // 0..1, nach Filtern
  fees_pct: number;                  // gesamt in %
  slippage_liq_pct: number;
  slippage_time_pct: number;
  timelag_tv_to_bot_ms: number;
  timelag_bot_to_ex_ms: number;
  mtd: { pnl: number; winrate: number; fees_pct: number; timelag_ms: number };
  last30d: { pnl: number; winrate: number; fees_pct: number; timelag_ms: number };
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
          winrate: 0.58,
          fees_pct: 1.2,
          slippage_liq_pct: 0.5,
          slippage_time_pct: 0.3,
          timelag_tv_to_bot_ms: 180,
          timelag_bot_to_ex_ms: 90,
          mtd: { pnl: 850.12, winrate: 0.61, fees_pct: 1.1, timelag_ms: 240 },
          last30d: { pnl: 1230.5, winrate: 0.59, fees_pct: 1.3, timelag_ms: 260 },
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

  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      { title: 'Portfoliowert total', value: currency(summary.portfolio_total), muted: true },
      { title: 'P&L heute', value: currency(summary.pnl_today) },
      { title: 'Win Rate heute', value: pct(summary.winrate_today) },
      { title: 'Offene Trades', value: String(summary.open_trades_count) },
      { title: 'Portfoliowert (gefiltert)', value: currency(summary.portfolio_filtered) },
      { title: 'Win Rate', value: pct(summary.winrate) },
      { title: 'Transaktionskosten gesamt', value: pct(summary.fees_pct) },
      { title: 'Slippage (Liquidität)', value: pct(summary.slippage_liq_pct) },
      { title: 'Slippage (Timelag)', value: pct(summary.slippage_time_pct) },
      { title: 'Timelag TV→Bot', value: ms(summary.timelag_tv_to_bot_ms) },
      { title: 'Timelag Bot→Exchange', value: ms(summary.timelag_bot_to_ex_ms) },
    ];
  }, [summary]);

  return (
    <>
      {/* Filterzeile */}
      <div className="mb-3 flex justify-end">
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

      {/* KPI-Karten */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, idx) => (
          <Card key={idx} className={`${c.muted ? 'border-primary' : ''}`}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{c.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${c.muted ? '' : ''}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* MTD & Last 30d */}
      {summary && (
        <div className="grid gap-3 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader><CardTitle>Aktueller Monat</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div>Realized P&L</div><div className="text-right">{currency(summary.mtd.pnl)}</div>
              <div>Win Rate</div><div className="text-right">{pct(summary.mtd.winrate)}</div>
              <div>Transaktionskosten</div><div className="text-right">{pct(summary.mtd.fees_pct)}</div>
              <div>Timelag</div><div className="text-right">{ms(summary.mtd.timelag_ms)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Letzte 30 Tage</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div>Realized P&L</div><div className="text-right">{currency(summary.last30d.pnl)}</div>
              <div>Win Rate</div><div className="text-right">{pct(summary.last30d.winrate)}</div>
              <div>Transaktionskosten</div><div className="text-right">{pct(summary.last30d.fees_pct)}</div>
              <div>Timelag</div><div className="text-right">{ms(summary.last30d.timelag_ms)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Equity-Chart */}
      <Card className="mt-4">
        <CardHeader><CardTitle>Portfoliowert / Tages-P&L</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="equity" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="pnl" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
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