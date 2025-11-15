// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import api, { type DashboardSummary, type DashboardKPIPeriod } from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import EquityChart from '@/components/ui/EquityChart';

function zurichToUTC(localHourMin: string): string {
  const [hours, minutes] = localHourMin.split(':').map(Number);
  const now = new Date();
  const isDST = now.getMonth() > 2 && now.getMonth() < 10;
  const offset = isDST ? 2 : 1;
  const utcHours = (hours - offset + 24) % 24;
  return `${String(utcHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
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
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (filters.botIds.length) params.bot_ids = filters.botIds.join(',');
        if (filters.symbols.length) params.symbols = filters.symbols.join(',');
        if (filters.side !== 'all') params.direction = filters.side;
        if (filters.dateFrom) params.date_from = filters.dateFrom.toISOString().split('T')[0];
        if (filters.dateTo) params.date_to = filters.dateTo.toISOString().split('T')[0];
        if (filters.timeFrom) params.open_hour = zurichToUTC(filters.timeFrom);
        if (filters.timeTo) params.close_hour = zurichToUTC(filters.timeTo);

        const data = await api.getDashboardSummary(params);
        setSummary(data);
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.side !== 'all') count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    return count;
  }, [filters]);

  // Helper components
  const MetricRow = ({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) => (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-foreground' : ''}`}>{value}</span>
    </div>
  );

  const renderKPISection = (title: string, kpi: DashboardKPIPeriod | null) => {
    if (!kpi) return null;
    const totalFees = (kpi.tx_breakdown?.fees || 0) + (kpi.tx_breakdown?.funding || 0) + 
                     (kpi.tx_breakdown?.slip_liq || 0) + (kpi.tx_breakdown?.slip_time || 0);
    const totalTimelag = (kpi.timelag_ms?.tv_bot_avg || 0) + (kpi.timelag_ms?.bot_ex_avg || 0);

    return (
      <Card>
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <MetricRow label="Realisierter P&L" value={formatCurrency(kpi.realized_pnl)} highlight />
          <MetricRow label="Win Rate" value={`${kpi.win_rate.toFixed(1)}%`} />
          <MetricRow label="TX Costs" value={`${kpi.tx_costs_pct.toFixed(2)}%`} />
          <MetricRow label="Total Fees" value={formatCurrency(totalFees)} />
          <MetricRow label="Total Timelag" value={`${Math.round(totalTimelag)} ms`} />
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <DashboardLayout pageTitle="Dashboard">
        <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Lädt...</div></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      pageTitle="Dashboard"
      mobileHeaderRight={
        <Button variant="ghost" size="sm" onClick={() => setShowFilters(true)} className="relative">
          <SlidersHorizontal className="h-5 w-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
              {activeFilterCount}
            </span>
          )}
        </Button>
      }
    >
      {/* Filter Modal (Mobile) */}
      {showFilters && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Filter</h2>
              <Button size="sm" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <TradesFiltersBar
                value={filters}
                onChange={setFilters}
                availableBots={bots}
                availableSymbols={symbols}
                showDateRange={true}
                showTimeRange={true}
              />
            </div>
          </div>
        </div>
      )}

      <div className="p-4 pb-24 space-y-6">
        {/* Filter Button - Desktop */}
        <div className="hidden lg:flex justify-end gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="relative"
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filter - Desktop (collapsible) */}
        {showFilters && (
          <div className="hidden lg:block border rounded-lg p-4 bg-muted/30">
            <TradesFiltersBar
              value={filters}
              onChange={setFilters}
              availableBots={bots}
              availableSymbols={symbols}
              showDateRange={true}
              showTimeRange={true}
            />
            <div className="flex justify-end mt-4">
              <Button size="sm" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
          </div>
        )}

        {/* Portfolio Total */}
        {summary && activeFilterCount === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portfolio Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatCurrency(summary.portfolio_total_equity)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtered View */}
        {activeFilterCount > 0 && summary?.kpis.current && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gesamtansicht (gefiltert)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <MetricRow label="Offene Trades" value={summary.kpis.current.open_trades} highlight />
              <MetricRow label="Win Rate" value={`${summary.kpis.current.win_rate.toFixed(1)}%`} />
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderKPISection('Heute', summary.kpis.today)}
            {renderKPISection('Aktueller Monat', summary.kpis.month)}
            {renderKPISection('Letzte 30 Tage', summary.kpis.last_30d)}
          </div>
        )}

        {/* Equity Chart */}
        {summary?.equity_timeseries && summary.equity_timeseries.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Equity Chart</CardTitle>
              <Link to="/trades" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                Alle Trades <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <EquityChart data={summary.equity_timeseries} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
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