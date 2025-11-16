import { useEffect, useState, useMemo } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Backend API Response Format
type KpiBlock = {
  realized_pnl: number | null;
  win_rate: number | null;
  count_signals: number | null;
  fee_pct: number | null;
  slip_liq_pct: number | null;
  slip_time_pct: number | null;
  fee_usdt: number | null;
  slip_liq_usdt: number | null;
  slip_time_usdt: number | null;
  timelag_entry_ms: number | null;
  timelag_processing_ms: number | null;
  timelag_exit_ms: number | null;
};

type Summary = {
  portfolio_total_equity: number;
  timeseries: { date: string; pnl: number; equity: number }[];
  kpis: {
    overall: KpiBlock;
    today: KpiBlock;
    month: KpiBlock;
    last_30d: KpiBlock;
  };
};

// Formatting helpers
const formatUSDT = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '$0.00';
  return `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '0.00%';
  return `${value.toFixed(2)}%`;
};

const formatWinRate = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (value === 0) return '0%';
  return `${(value * 100).toFixed(2)}%`;
};

const formatTimelag = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value} ms`;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toString();
};

// Chart data formatter
const formatChartData = (timeseries: { date: string; pnl: number; equity: number }[]) => {
  return timeseries.map(item => ({
    date: item.date,
    Equity: item.equity,
    'Daily P&L': item.pnl,
  }));
};

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  // Load bots & symbols
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

  // Load dashboard data
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.botIds.length) qs.set('bot_ids', filters.botIds.join(','));
    if (filters.symbols.length) qs.set('symbols', filters.symbols.join(','));
    if (filters.dateFrom) qs.set('from', filters.dateFrom.toISOString().split('T')[0]);
    if (filters.dateTo) qs.set('to', filters.dateTo.toISOString().split('T')[0]);
    if (filters.timeFrom) qs.set('time_from', filters.timeFrom);
    if (filters.timeTo) qs.set('time_to', filters.timeTo);

    setIsLoading(true);
    (async () => {
      try {
        const data = await apiRequest<Summary>(`/api/v1/dashboard/summary?${qs.toString()}`);
        setSummary(data);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [filters]);

  const handleApplyFilters = (newFilters: TradesFilters) => {
    setFilters(newFilters);
    setShowFilters(false);
  };

  const chartData = useMemo(() => {
    if (!summary?.timeseries) return [];
    return formatChartData(summary.timeseries);
  }, [summary?.timeseries]);

  // Custom tooltip to show daily PnL with color
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload;
    const dailyPnl = data['Daily P&L'];
    const isPositive = dailyPnl >= 0;
    
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium mb-2">{data.date}</p>
        <p className="text-sm">
          <span className="text-muted-foreground">Equity: </span>
          <span className="font-medium">{formatUSDT(data.Equity)}</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Daily P&L: </span>
          <span className={`font-medium ${isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
            {formatUSDT(dailyPnl)}
          </span>
        </p>
      </div>
    );
  };

  return (
    <DashboardLayout
      pageTitle="Dashboard"
      mobileHeaderRight={
        <Button variant="ghost" size="icon" onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      }
    >
      {showFilters && (
        <div className="mb-6">
          <TradesFiltersBar
            value={filters}
            onChange={handleApplyFilters}
            availableBots={bots}
            availableSymbols={symbols}
            showDateRange={true}
            showTimeRange={true}
          />
        </div>
      )}

      {!summary ? (
        <div className="space-y-6">
          {/* Loading skeletons */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-32" /></CardContent>
          </Card>
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Portfolio Total */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Portfolio Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatUSDT(summary.portfolio_total_equity)}
              </div>
            </CardContent>
          </Card>

          {/* Gesamtansicht (filtered) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Gesamtansicht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.overall.realized_pnl)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.overall.win_rate)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(summary.kpis.overall.count_signals)} />
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Transaktionskosten
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Total %" value={formatPercent(summary.kpis.overall.fee_pct)} />
                  <MetricRow label="Fees %" value={formatPercent(summary.kpis.overall.fee_pct)} />
                  <MetricRow label="Liq. Slippage %" value={formatPercent(summary.kpis.overall.slip_liq_pct)} />
                  <MetricRow label="Time Slippage %" value={formatPercent(summary.kpis.overall.slip_time_pct)} />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Timelags
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Entry" value={formatTimelag(summary.kpis.overall.timelag_entry_ms)} />
                  <MetricRow label="Processing" value={formatTimelag(summary.kpis.overall.timelag_processing_ms)} />
                  <MetricRow label="Exit" value={formatTimelag(summary.kpis.overall.timelag_exit_ms)} />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Heute */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Heute</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.today.realized_pnl)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.today.win_rate)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(summary.kpis.today.count_signals)} />
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Transaktionskosten
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Total %" value={formatPercent(summary.kpis.today.fee_pct)} />
                  <MetricRow label="Fees %" value={formatPercent(summary.kpis.today.fee_pct)} />
                  <MetricRow label="Liq. Slippage %" value={formatPercent(summary.kpis.today.slip_liq_pct)} />
                  <MetricRow label="Time Slippage %" value={formatPercent(summary.kpis.today.slip_time_pct)} />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Timelags
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Entry" value={formatTimelag(summary.kpis.today.timelag_entry_ms)} />
                  <MetricRow label="Processing" value={formatTimelag(summary.kpis.today.timelag_processing_ms)} />
                  <MetricRow label="Exit" value={formatTimelag(summary.kpis.today.timelag_exit_ms)} />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Aktueller Monat */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Aktueller Monat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.month.realized_pnl)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.month.win_rate)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(summary.kpis.month.count_signals)} />
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Transaktionskosten
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Total %" value={formatPercent(summary.kpis.month.fee_pct)} />
                  <MetricRow label="Fees %" value={formatPercent(summary.kpis.month.fee_pct)} />
                  <MetricRow label="Liq. Slippage %" value={formatPercent(summary.kpis.month.slip_liq_pct)} />
                  <MetricRow label="Time Slippage %" value={formatPercent(summary.kpis.month.slip_time_pct)} />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Timelags
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Entry" value={formatTimelag(summary.kpis.month.timelag_entry_ms)} />
                  <MetricRow label="Processing" value={formatTimelag(summary.kpis.month.timelag_processing_ms)} />
                  <MetricRow label="Exit" value={formatTimelag(summary.kpis.month.timelag_exit_ms)} />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Letzte 30 Tage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Letzte 30 Tage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.last_30d.realized_pnl)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.last_30d.win_rate)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(summary.kpis.last_30d.count_signals)} />
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Transaktionskosten
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Total %" value={formatPercent(summary.kpis.last_30d.fee_pct)} />
                  <MetricRow label="Fees %" value={formatPercent(summary.kpis.last_30d.fee_pct)} />
                  <MetricRow label="Liq. Slippage %" value={formatPercent(summary.kpis.last_30d.slip_liq_pct)} />
                  <MetricRow label="Time Slippage %" value={formatPercent(summary.kpis.last_30d.slip_time_pct)} />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  Timelags
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <MetricRow label="Entry" value={formatTimelag(summary.kpis.last_30d.timelag_entry_ms)} />
                  <MetricRow label="Processing" value={formatTimelag(summary.kpis.last_30d.timelag_processing_ms)} />
                  <MetricRow label="Exit" value={formatTimelag(summary.kpis.last_30d.timelag_exit_ms)} />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Equity Chart - at the bottom */}
          <Card>
            <CardHeader>
              <CardTitle>Equity & P&L</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="Equity" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Keine Chart-Daten verfügbar
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}

// Helper component for metric rows
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
