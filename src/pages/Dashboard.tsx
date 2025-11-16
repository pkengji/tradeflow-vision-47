import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

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

  // Helper to render a KPI block
  const renderKpiBlock = (title: string, kpis: KpiBlock | undefined) => {
    const k = kpis || {
      realized_pnl: null,
      win_rate: null,
      count_signals: null,
      fee_pct: null,
      slip_liq_pct: null,
      slip_time_pct: null,
      fee_usdt: null,
      slip_liq_usdt: null,
      slip_time_usdt: null,
      timelag_entry_ms: null,
      timelag_processing_ms: null,
      timelag_exit_ms: null,
    };

    return (
      <Card key={title}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Performance */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Performance</div>
            <div className="grid grid-cols-2 gap-3">
              <MetricItem label="Realized P&L" value={formatUSDT(k.realized_pnl)} />
              <MetricItem label="Win Rate" value={formatWinRate(k.win_rate)} />
              <MetricItem label="Anzahl Signale" value={formatNumber(k.count_signals)} />
            </div>
          </div>

          {/* Transaction Costs */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Transaktionskosten</div>
            <div className="grid grid-cols-2 gap-3">
              <MetricItem label="Total %" value={formatPercent(k.fee_pct)} />
              <MetricItem label="Total USDT" value={formatUSDT(k.fee_usdt)} />
              <MetricItem label="Fees %" value={formatPercent(k.fee_pct)} />
              <MetricItem label="Fees USDT" value={formatUSDT(k.fee_usdt)} />
              <MetricItem label="Liq. Slippage %" value={formatPercent(k.slip_liq_pct)} />
              <MetricItem label="Liq. Slippage USDT" value={formatUSDT(k.slip_liq_usdt)} />
              <MetricItem label="Time Slippage %" value={formatPercent(k.slip_time_pct)} />
              <MetricItem label="Time Slippage USDT" value={formatUSDT(k.slip_time_usdt)} />
            </div>
          </div>

          {/* Timelags */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Timelags</div>
            <div className="grid grid-cols-2 gap-3">
              <MetricItem label="Entry" value={formatTimelag(k.timelag_entry_ms)} />
              <MetricItem label="Processing" value={formatTimelag(k.timelag_processing_ms)} />
              <MetricItem label="Exit" value={formatTimelag(k.timelag_exit_ms)} />
            </div>
          </div>
        </CardContent>
      </Card>
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

      <div className="space-y-6">
        {/* Portfolio Total */}
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Portfolio Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatUSDT(summary?.portfolio_total_equity || 0)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chart */}
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-80 w-full" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Equity & P&L</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.timeseries && summary.timeseries.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={summary.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" name="Equity" />
                    <Line type="monotone" dataKey="pnl" stroke="hsl(var(--chart-2))" name="P&L" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  No chart data available
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* KPI Sections - Always show all 4 */}
        {isLoading ? (
          <>
            {['Gesamtansicht', 'Heute', 'Aktueller Monat', 'Letzte 30 Tage'].map((title) => (
              <Card key={title}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            {renderKpiBlock('Gesamtansicht', summary?.kpis?.overall)}
            {renderKpiBlock('Heute', summary?.kpis?.today)}
            {renderKpiBlock('Aktueller Monat', summary?.kpis?.month)}
            {renderKpiBlock('Letzte 30 Tage', summary?.kpis?.last_30d)}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// Helper component for metric items
function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
