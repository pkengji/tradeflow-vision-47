// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';

// Typen basierend auf Backend API-Struktur
type KPIPeriod = {
  realized_pnl: number;
  win_rate: number;
  tx_costs_pct: number;
  tx_breakdown: {
    fees: number;
    funding: number;
    slip_liq: number;
    slip_time: number;
  };
  timelag_ms: {
    tv_bot_avg: number;
    bot_ex_avg: number;
  };
};

type Summary = {
  portfolio_total_equity: number;
  kpis: {
    today: KPIPeriod;
    month: KPIPeriod;
    last_30d: KPIPeriod;
    current: {
      open_trades: number;
      filtered_portfolio_equity: number;
      win_rate: number;
    };
  };
  equity_timeseries: Array<{ ts: string; day_pnl: number }>;
};

type DailyPnl = { date: string; pnl: number; equity: number };

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<DailyPnl[]>([]);
  const [signalsCount, setSignalsCount] = useState({ total: 0, today: 0, mtd: 0, last30d: 0 });
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
  const [showFilters, setShowFilters] = useState(false);

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
        const [s, outboxRes] = await Promise.all([
          apiRequest<Summary>(`/api/v1/dashboard/summary?${qs.toString()}`),
          api.getOutbox()
        ]);
        setSummary(s);
        
        // Count TradingView signals
        const tvSignals = outboxRes.filter((item: any) => item.kind === 'tradingview');
        const today = new Date().toISOString().split('T')[0];
        const tvSignalsToday = tvSignals.filter((item: any) => 
          item.created_at?.startsWith(today)
        );
        
        // Calculate MTD and Last30D signal counts
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const tvSignalsMTD = tvSignals.filter((item: any) => 
          item.created_at && item.created_at >= firstDayOfMonth
        );
        const tvSignalsLast30D = tvSignals.filter((item: any) => 
          item.created_at && item.created_at >= thirtyDaysAgo
        );
        
        setSignalsCount({ 
          total: tvSignals.length, 
          today: tvSignalsToday.length,
          mtd: tvSignalsMTD.length,
          last30d: tvSignalsLast30D.length
        });
      } catch (err) {
        console.error('Dashboard summary error:', err);
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

  // Prüfen ob Datums- oder Zeitfilter aktiv
  const hasDateFilter = !!(filters.dateFrom || filters.dateTo);
  const hasTimeFilter = !!(filters.timeFrom || filters.timeTo);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.side && filters.side !== 'all') count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    return count;
  }, [filters]);

  const FilterButton = (
    <Button 
      variant="ghost" 
      size="icon"
      onClick={() => setShowFilters(!showFilters)}
      className="relative"
    >
      <SlidersHorizontal className="h-5 w-5" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  return (
    <DashboardLayout pageTitle="Dashboard" mobileHeaderRight={FilterButton}>
      {/* Filter-Modal - Mobile */}
      {showFilters && (
        <div className="fixed inset-0 bg-background/80 z-50 lg:hidden" onClick={() => setShowFilters(false)}>
          <div className="fixed inset-x-0 top-14 bottom-16 bg-background flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-auto">
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
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4 p-4 pb-24 max-w-7xl mx-auto">
        {/* Filterzeile - Desktop */}
        <div className="hidden lg:flex justify-end">
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

        {/* 1. Portfoliowert total - ungefiltert */}
        {summary && (
          <Card className="border-primary/50">
            <CardContent className="pt-4 pb-4">
              <div className="text-center">
                <div className="text-[var(--font-size-subsection-title)] text-muted-foreground mb-1">Portfolio total</div>
                <div className="text-[var(--font-size-value-large)] font-bold text-foreground">
                  {formatCurrency(summary.portfolio_total_equity)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2. Gesamtansicht (gefiltert) */}
        {summary && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Gesamtansicht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              {/* Main Metrics - Simple List */}
              <div className="space-y-0">
                <MetricRow label="Realized P&L" value={formatCurrency(summary.kpis.current.filtered_portfolio_equity)} />
                <MetricRow label="Portfoliowert" value={formatCurrency(summary.kpis.current.filtered_portfolio_equity)} />
                <MetricRow label="Win Rate" value={pct(summary.kpis.current.win_rate)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.total)} />
              </div>

              {/* Transaktionskosten */}
              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.kpis.current.win_rate)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value="-" small />
                  <MetricRow label="Funding Fees" value="-" small />
                  <MetricRow label="Slippage (Liquidität)" value="-" small />
                  <MetricRow label="Slippage (Timelag)" value="-" small />
                </div>
              </div>

              {/* Timelag */}
              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value="-" 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value="-" small />
                  <MetricRow label="Processing time" value="-" small />
                  <MetricRow label="Exit" value="-" small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 3. Heute (nur wenn kein Datumsfilter aktiv) */}
        {summary && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Heute</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <Link to="/trades?status=closed">
                  <MetricRow label="P&L realized heute" value={formatCurrency(summary.kpis.today.realized_pnl)} hoverable />
                </Link>
                <MetricRow label="Win Rate heute" value={pct(summary.kpis.today.win_rate)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.today)} />
                <Link to="/trades?status=open">
                  <MetricRow label="Offene Trades aktuell" value={summary.kpis.current.open_trades} hoverable />
                </Link>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.kpis.today.tx_costs_pct)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={formatCurrency(summary.kpis.today.tx_breakdown.fees)} small />
                  <MetricRow label="Funding Fees" value={formatCurrency(summary.kpis.today.tx_breakdown.funding)} small />
                  <MetricRow label="Slippage (Liquidität)" value={formatCurrency(summary.kpis.today.tx_breakdown.slip_liq)} small />
                  <MetricRow label="Slippage (Timelag)" value={formatCurrency(summary.kpis.today.tx_breakdown.slip_time)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms(summary.kpis.today.timelag_ms.tv_bot_avg + summary.kpis.today.timelag_ms.bot_ex_avg)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.kpis.today.timelag_ms.tv_bot_avg)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.kpis.today.timelag_ms.bot_ex_avg)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Aktueller Monat (nur wenn kein Datumsfilter) */}
        {summary && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Aktueller Monat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <MetricRow label="Realized P&L" value={formatCurrency(summary.kpis.month.realized_pnl)} />
                <MetricRow label="Win Rate" value={pct(summary.kpis.month.win_rate)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.mtd)} />
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.kpis.month.tx_costs_pct)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={formatCurrency(summary.kpis.month.tx_breakdown.fees)} small />
                  <MetricRow label="Funding Fees" value={formatCurrency(summary.kpis.month.tx_breakdown.funding)} small />
                  <MetricRow label="Slippage (Liquidität)" value={formatCurrency(summary.kpis.month.tx_breakdown.slip_liq)} small />
                  <MetricRow label="Slippage (Timelag)" value={formatCurrency(summary.kpis.month.tx_breakdown.slip_time)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms(summary.kpis.month.timelag_ms.tv_bot_avg + summary.kpis.month.timelag_ms.bot_ex_avg)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.kpis.month.timelag_ms.tv_bot_avg)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.kpis.month.timelag_ms.bot_ex_avg)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. Letzte 30 Tage (nur wenn kein Datumsfilter) */}
        {summary && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Letzte 30 Tage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <MetricRow label="Realized P&L" value={formatCurrency(summary.kpis.last_30d.realized_pnl)} />
                <MetricRow label="Win Rate" value={pct(summary.kpis.last_30d.win_rate)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.last30d)} />
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.kpis.last_30d.tx_costs_pct)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={formatCurrency(summary.kpis.last_30d.tx_breakdown.fees)} small />
                  <MetricRow label="Funding Fees" value={formatCurrency(summary.kpis.last_30d.tx_breakdown.funding)} small />
                  <MetricRow label="Slippage (Liquidität)" value={formatCurrency(summary.kpis.last_30d.tx_breakdown.slip_liq)} small />
                  <MetricRow label="Slippage (Timelag)" value={formatCurrency(summary.kpis.last_30d.tx_breakdown.slip_time)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms(summary.kpis.last_30d.timelag_ms.tv_bot_avg + summary.kpis.last_30d.timelag_ms.bot_ex_avg)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.kpis.last_30d.timelag_ms.tv_bot_avg)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.kpis.last_30d.timelag_ms.bot_ex_avg)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 6. Equity-Chart */}
        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Portfoliowert / Tages-P&L</CardTitle>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 pb-3">
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
                          <div>{formatCurrency(value)} (Portfoliowert)</div>
                          <div className={dailyPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {formatCurrency(dailyPnl)} (Tages-P&L)
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
    </DashboardLayout>
  );
}

// Helper Components
function MetricRow({ 
  label, 
  value, 
  hoverable = false, 
  small = false 
}: { 
  label: string; 
  value: string | number; 
  hoverable?: boolean; 
  small?: boolean; 
}) {
  return (
    <div 
      className={`flex justify-between items-center py-0.5 ${
        hoverable ? 'hover:bg-muted/30 rounded px-2 -mx-2 cursor-pointer transition-colors' : ''
      }`}
    >
      <span className={`${small ? 'text-xs text-muted-foreground' : 'text-sm text-foreground'}`}>
        {label}
      </span>
      <span className={`${small ? 'text-xs text-muted-foreground' : 'text-sm text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

// Format-Helper
function formatCurrencyShort(value: number) {
  if (Math.abs(value) >= 1000) {
    return `$ ${(value / 1000).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}k`;
  }
  return `$ ${value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

function pct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2).replace('.', ',')} %`;
}

function ms(x: number | null | undefined) {
  if (x == null) return '—';
  return `${x.toFixed(0)} ms`;
}