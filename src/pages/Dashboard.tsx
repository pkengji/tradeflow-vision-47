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
  pnl_filtered: number;              // realized P&L nach Filtern
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
          pnl_filtered: 456.78,
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
    <div className="space-y-6 p-4 pb-24 max-w-7xl mx-auto">
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
        <Card className="border-primary shadow-lg">
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">Portfoliowert Total</div>
              <div className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {currency(summary.portfolio_total)}
              </div>
              <div className="text-xs text-muted-foreground mt-2">exkl. unrealized P&L</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. Gesamtansicht (gefiltert) */}
      {summary && (
        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Gesamtansicht (gefiltert)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard label="Realized P&L" value={currency(summary.pnl_filtered)} />
              <MetricCard label="Portfoliowert" value={currency(summary.portfolio_filtered)} />
              <MetricCard label="Win Rate" value={pct(summary.winrate_filtered)} />
            </div>

            {/* Transaktionskosten */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Transaktionskosten Total</span>
                <span className="font-bold text-lg">{pct(summary.fees_pct_filtered_total)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-4">
                <SubMetric label="Fees" value={pct(summary.fees_pct_filtered)} />
                <SubMetric label="Slippage (Liquidität)" value={pct(summary.slippage_liq_pct_filtered)} />
                <SubMetric label="Slippage (Timelag)" value={pct(summary.slippage_time_pct_filtered)} />
              </div>
            </div>

            {/* Timelag */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Timelag Total</span>
                <span className="font-bold text-lg">{ms(summary.timelag_tv_to_bot_ms_filtered + summary.timelag_bot_to_ex_ms_filtered)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4">
                <SubMetric label="Timelag TV → Bot" value={ms(summary.timelag_tv_to_bot_ms_filtered)} />
                <SubMetric label="Timelag Bot → Exchange" value={ms(summary.timelag_bot_to_ex_ms_filtered)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Heute (nur wenn kein Zeitfilter aktiv) */}
      {summary && !hasTimeFilter && (
        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Heute</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link to="/trades?status=closed">
                <MetricCard label="P&L realized heute" value={currency(summary.pnl_today)} hoverable />
              </Link>
              <MetricCard label="Win Rate heute" value={pct(summary.winrate_today)} />
              <Link to="/trades?status=open">
                <MetricCard label="Offene Trades aktuell" value={summary.open_trades_count} hoverable />
              </Link>
            </div>

            {/* Transaktionskosten */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Transaktionskosten Total</span>
                <span className="font-bold text-lg">{pct(summary.fees_pct_today_total)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-4">
                <SubMetric label="Fees" value={pct(summary.fees_pct_today)} />
                <SubMetric label="Slippage (Liquidität)" value={pct(summary.slippage_liq_pct_today)} />
                <SubMetric label="Slippage (Timelag)" value={pct(summary.slippage_time_pct_today)} />
              </div>
            </div>

            {/* Timelag */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Timelag Total</span>
                <span className="font-bold text-lg">{ms(summary.timelag_tv_to_bot_ms_today + summary.timelag_bot_to_ex_ms_today)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4">
                <SubMetric label="Timelag TV → Bot" value={ms(summary.timelag_tv_to_bot_ms_today)} />
                <SubMetric label="Timelag Bot → Exchange" value={ms(summary.timelag_bot_to_ex_ms_today)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Aktueller Monat */}
      {summary && (
        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Aktueller Monat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricCard label="Realized P&L" value={currency(summary.mtd.pnl)} />
              <MetricCard label="Win Rate" value={pct(summary.mtd.winrate)} />
            </div>

            {/* Transaktionskosten */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Transaktionskosten Total</span>
                <span className="font-bold text-lg">{pct(summary.mtd.fees_pct_total)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-4">
                <SubMetric label="Fees" value={pct(summary.mtd.fees_pct)} />
                <SubMetric label="Slippage (Liquidität)" value={pct(summary.mtd.slippage_liq_pct)} />
                <SubMetric label="Slippage (Timelag)" value={pct(summary.mtd.slippage_time_pct)} />
              </div>
            </div>

            {/* Timelag */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Timelag Total</span>
                <span className="font-bold text-lg">{ms(summary.mtd.timelag_tv_to_bot_ms + summary.mtd.timelag_bot_to_ex_ms)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4">
                <SubMetric label="Timelag TV → Bot" value={ms(summary.mtd.timelag_tv_to_bot_ms)} />
                <SubMetric label="Timelag Bot → Exchange" value={ms(summary.mtd.timelag_bot_to_ex_ms)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Letzte 30 Tage */}
      {summary && (
        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Letzte 30 Tage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricCard label="Realized P&L" value={currency(summary.last30d.pnl)} />
              <MetricCard label="Win Rate" value={pct(summary.last30d.winrate)} />
            </div>

            {/* Transaktionskosten */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Transaktionskosten Total</span>
                <span className="font-bold text-lg">{pct(summary.last30d.fees_pct_total)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-4">
                <SubMetric label="Fees" value={pct(summary.last30d.fees_pct)} />
                <SubMetric label="Slippage (Liquidität)" value={pct(summary.last30d.slippage_liq_pct)} />
                <SubMetric label="Slippage (Timelag)" value={pct(summary.last30d.slippage_time_pct)} />
              </div>
            </div>

            {/* Timelag */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="font-medium">Timelag Total</span>
                <span className="font-bold text-lg">{ms(summary.last30d.timelag_tv_to_bot_ms + summary.last30d.timelag_bot_to_ex_ms)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4">
                <SubMetric label="Timelag TV → Bot" value={ms(summary.last30d.timelag_tv_to_bot_ms)} />
                <SubMetric label="Timelag Bot → Exchange" value={ms(summary.last30d.timelag_bot_to_ex_ms)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Equity-Chart (nur nach Datumsrange filterbar) */}
      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Portfoliowert / Tages-P&L</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
              <XAxis 
                dataKey="date" 
                className="text-xs" 
                tickFormatter={(value) => formatDate(value)}
              />
              <YAxis yAxisId="left" className="text-xs" tickFormatter={(value) => formatCurrencyShort(value)} />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold', marginBottom: '8px' }}
                labelFormatter={(value) => formatDate(value)}
                formatter={(value: any, name: string, props: any) => {
                  const index = props.payload ? series.findIndex(d => d.date === props.payload.date) : -1;
                  const prevEquity = index > 0 ? series[index - 1].equity : props.payload?.equity || 0;
                  const currentEquity = props.payload?.equity || 0;
                  const dailyPnl = currentEquity - prevEquity;
                  
                  if (name === 'equity') {
                    return [
                      <div key="equity" className="space-y-1">
                        <div>{currency(value)} (Portfoliowert)</div>
                        <div className={dailyPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {currency(dailyPnl)} (Tages-P&L)
                        </div>
                      </div>
                    ];
                  }
                  return [value, name];
                }}
              />
              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="equity" 
                stroke="hsl(var(--primary))" 
                strokeWidth={3} 
                dot={false}
                name="equity"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper Components
function MetricCard({ label, value, hoverable = false }: { label: string; value: string | number; hoverable?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border bg-card shadow-sm ${hoverable ? 'hover:shadow-md hover:border-primary/50 transition-all cursor-pointer' : ''}`}>
      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function SubMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col p-2 rounded bg-background">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm mt-1">{value}</span>
    </div>
  );
}

// Format-Helper mit Schweizer Format (TT.MM.JJJJ, ' als Tausendertrennzeichen, . als Dezimaltrennzeichen)
function currency(
  value: number | null | undefined,
  currencyCode: string = 'USD'
) {
  const n =
    typeof value === 'number' && isFinite(value)
      ? value
      : typeof value === 'string' && !isNaN(parseFloat(value))
      ? parseFloat(value)
      : 0;

  // Schweizer Format: ' als Tausendertrennzeichen, . als Dezimaltrennzeichen
  const formatted = n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${formatted} ${currencyCode}`;
}

function formatCurrencyShort(value: number) {
  if (Math.abs(value) >= 1000000) {
    return (value / 1000000).toFixed(1).replace('.', ',') + 'M';
  } else if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(1).replace('.', ',') + 'K';
  }
  return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && isFinite(v)
    ? v
    : typeof v === 'string' && !isNaN(parseFloat(v))
    ? parseFloat(v)
    : fallback;

function pct(v: number | string | null | undefined) {
  const n = num(v, 0);
  const x = n > 1 ? n : n * 100;
  return `${x.toFixed(1).replace('.', ',')}%`;
}

function ms(x: number | string | null | undefined) {
  const n = Math.round(num(x, 0));
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")} ms`;
}