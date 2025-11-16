// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Link } from 'react-router-dom';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

// Typen - Backend API Format
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
        // daily-pnl liefert jetzt {date,pnl,equity}
        const d = await apiRequest<DailyPnl[]>(`/api/v1/dashboard/daily-pnl?${qs.toString()}`);
        setSeries(Array.isArray(d) ? d : []);
      } catch (err) {
        console.error('Daily PnL error:', err);
        setSeries([]);
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
        {/* Skeletons while loading */}
        {!summary && series.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-7 w-40 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-lg font-semibold">Gesamtansicht</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 py-2 pb-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded" />
                ))}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Equity & Daily P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] bg-muted rounded" />
              </CardContent>
            </Card>
          </div>
        )}

        <div className="hidden lg:block">
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <div className="flex justify-end mb-2">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="ml-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <Card className="mb-4">
                <CardContent className="pt-4">
                  <TradesFiltersBar
                    value={filters}
                    onChange={setFilters}
                    availableBots={bots}
                    availableSymbols={symbols}
                    showDateRange={true}
                    showTimeRange={true}
                    showSignalKind={false}
                  />
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* 1. Portfoliowert total - ungefiltert */}
        {summary && (
          <Card className="border-primary/50">
            <CardContent className="pt-4 pb-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">Portfolio total</div>
                <div className="text-3xl font-bold text-foreground">
                  {formatCurrency(summary.portfolio_total ?? 0)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2. Gesamtansicht (gefiltert) */}
        {summary && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-lg font-semibold">Gesamtansicht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              {/* Main Metrics - Simple List */}
              <div className="space-y-0">
                <MetricRow label="Realized P&L" value={formatCurrency(summary.pnl_filtered)} />
                <MetricRow label="Portfoliowert" value={formatCurrency(summary.portfolio_filtered)} />
                <MetricRow label="Win Rate" value={pct(summary.winrate_filtered)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.total)} />
              </div>

              {/* Transaktionskosten */}
              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.fees_pct_filtered_total)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={pct(summary.fees_pct_filtered)} small />
                  <MetricRow label="Slippage (Liquidität)" value={pct(summary.slippage_liq_pct_filtered)} small />
                  <MetricRow label="Slippage (Timelag)" value={pct(summary.slippage_time_pct_filtered)} small />
                </div>
              </div>

              {/* Timelag */}
              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms(summary.timelag_tv_to_bot_ms_filtered + summary.timelag_bot_to_ex_ms_filtered)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.timelag_tv_to_bot_ms_filtered)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.timelag_bot_to_ex_ms_filtered)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 3. Heute (nur wenn kein Datumsfilter aktiv) */}
        {summary && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-lg font-semibold">Heute</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <Link to="/trades?status=closed">
                  <MetricRow label="P&L realized heute" value={formatCurrency(summary.pnl_today ?? 0)} hoverable />
                </Link>
                <MetricRow label="Win Rate heute" value={pct(summary.winrate_today ?? 0)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.today)} />
                <Link to="/trades?status=open">
                  <MetricRow label="Offene Trades aktuell" value={summary.open_trades_count ?? 0} hoverable />
                </Link>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.fees_pct_today_total ?? 0)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={pct(summary.fees_pct_today ?? 0)} small />
                  <MetricRow label="Slippage (Liquidität)" value={pct(summary.slippage_liq_pct_today ?? 0)} small />
                  <MetricRow label="Slippage (Timelag)" value={pct(summary.slippage_time_pct_today ?? 0)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms((summary.timelag_tv_to_bot_ms_today ?? 0) + (summary.timelag_bot_to_ex_ms_today ?? 0))} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.timelag_tv_to_bot_ms_today ?? 0)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.timelag_bot_to_ex_ms_today ?? 0)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Aktueller Monat (nur wenn kein Datumsfilter) */}
        {summary && summary.mtd && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-lg font-semibold">Aktueller Monat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <MetricRow label="Realized P&L" value={formatCurrency(summary.mtd.pnl ?? 0)} />
                <MetricRow label="Win Rate" value={pct(summary.mtd.winrate ?? 0)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.mtd)} />
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.mtd.fees_pct_total ?? 0)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={pct(summary.mtd.fees_pct ?? 0)} small />
                  <MetricRow label="Slippage (Liquidität)" value={pct(summary.mtd.slippage_liq_pct ?? 0)} small />
                  <MetricRow label="Slippage (Timelag)" value={pct(summary.mtd.slippage_time_pct ?? 0)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms((summary.mtd.timelag_tv_to_bot_ms ?? 0) + (summary.mtd.timelag_bot_to_ex_ms ?? 0))} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.mtd.timelag_tv_to_bot_ms ?? 0)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.mtd.timelag_bot_to_ex_ms ?? 0)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. Letzte 30 Tage (nur wenn kein Datumsfilter) */}
        {summary && summary.last30d && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-lg font-semibold">Letzte 30 Tage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <MetricRow label="Realized P&L" value={formatCurrency(summary.last30d.pnl ?? 0)} />
                <MetricRow label="Win Rate" value={pct(summary.last30d.winrate ?? 0)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.last30d)} />
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Transaktionskosten" 
                  value={pct(summary.last30d.fees_pct_total ?? 0)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees" value={pct(summary.last30d.fees_pct ?? 0)} small />
                  <MetricRow label="Slippage (Liquidität)" value={pct(summary.last30d.slippage_liq_pct ?? 0)} small />
                  <MetricRow label="Slippage (Timelag)" value={pct(summary.last30d.slippage_time_pct ?? 0)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms((summary.last30d.timelag_tv_to_bot_ms ?? 0) + (summary.last30d.timelag_bot_to_ex_ms ?? 0))} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(summary.last30d.timelag_tv_to_bot_ms ?? 0)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(summary.last30d.timelag_bot_to_ex_ms ?? 0)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 6. Equity-Chart (aus pnl.py) */}
        {series.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-semibold">Equity & Daily P&L</CardTitle>
              <Link to="/trades" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                Alle Trades <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(d) => {
                      const [, m, day] = d.split('-');
                      return `${day}.${m}`;
                    }}
                  />
                  <YAxis 
                    yAxisId="equity"
                    orientation="left"
                    stroke="hsl(var(--primary))"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    yAxisId="pnl"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="equity"
                    type="monotone" 
                    dataKey="equity" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    name="Equity"
                  />
                  <Line 
                    yAxisId="pnl"
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeWidth={1.5}
                    dot={false}
                    name="Daily P&L"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// Helper für Metric-Row
function MetricRow({ 
  label, 
  value, 
  small = false, 
  hoverable = false 
}: { 
  label: string; 
  value: string | number; 
  small?: boolean; 
  hoverable?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-0.5 ${hoverable ? 'hover:bg-muted/50 cursor-pointer rounded px-1 -mx-1' : ''}`}>
      <span className={`${small ? 'text-xs' : 'text-sm'} text-muted-foreground`}>{label}</span>
      <span className={`${small ? 'text-xs' : 'text-sm'} font-medium`}>{value}</span>
    </div>
  );
}

// Format-Helper
function pct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2).replace('.', ',')} %`;
}

function ms(x: number | null | undefined) {
  if (x == null) return '—';
  return `${x.toFixed(0)} ms`;
}