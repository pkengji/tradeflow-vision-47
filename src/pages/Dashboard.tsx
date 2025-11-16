import { useEffect, useState, useMemo } from 'react';
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
  realized_pnl: number;
  win_rate: number;
  trade_count: number;
  tx_costs_pct: number;
  tx_breakdown_usdt: {
    fees: number;
    funding: number;
    slip_liquidity: number;
    slip_time: number;
  };
  timelag_ms: {
    entry_ms_avg: number | null;
    engine_ms_avg: number | null;
    exit_ms_avg: number | null;
    samples: number;
  };
};

type Summary = {
  portfolio_total_equity: number;
  equity_timeseries: { ts: string; day_pnl: number; equity?: number }[];
  kpis: {
    overall?: KpiBlock;
    today?: KpiBlock;
    month?: KpiBlock;
    last_30d?: KpiBlock;
    current?: {
      open_trades: number;
      win_rate: number;
    };
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

const formatWinRate = (value: number | null | undefined, tradeCount?: number): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (value === 0) return '0%';
  const percentage = `${(value * 100).toFixed(2)}%`;
  if (tradeCount !== undefined) {
    return `${percentage} (${tradeCount} Trades)`;
  }
  return percentage;
};

const formatTimelag = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value} ms`;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toString();
};

// Fill in missing days with flat equity line
const fillMissingDays = (timeseries: { ts: string; day_pnl: number }[], days: number) => {
  if (timeseries.length === 0) return [];
  
  const result: { ts: string; day_pnl: number }[] = [];
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  
  for (let i = days - 1; i >= 0; i--) {
    const currentDate = new Date(endDate);
    currentDate.setDate(endDate.getDate() - i);
    const dateStr = currentDate.toISOString().split('T')[0];
    
    const existing = timeseries.find(t => t.ts.startsWith(dateStr));
    result.push({
      ts: dateStr,
      day_pnl: existing?.day_pnl ?? 0
    });
  }
  
  return result;
};

// Chart data formatter - calculate cumulative equity from PnL
const formatChartData = (timeseries: { ts: string; day_pnl: number }[], initialEquity: number) => {
  let cumulativeEquity = initialEquity;
  return timeseries.map((item, idx) => {
    // For first item, calculate starting equity by subtracting all PnLs
    if (idx === 0) {
      const totalPnl = timeseries.reduce((sum, t) => sum + t.day_pnl, 0);
      cumulativeEquity = initialEquity - totalPnl;
    }
    cumulativeEquity += item.day_pnl;
    return {
      date: new Date(item.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      Equity: cumulativeEquity,
      'Daily P&L': item.day_pnl,
    };
  });
};

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBots, setSelectedBots] = useState<number[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [direction, setDirection] = useState<string>('both');
  const [openHourFrom, setOpenHourFrom] = useState<string>('');
  const [openHourTo, setOpenHourTo] = useState<string>('');
  const [closeHourFrom, setCloseHourFrom] = useState<string>('');
  const [closeHourTo, setCloseHourTo] = useState<string>('');
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [txCostsMode, setTxCostsMode] = useState<'percent' | 'usdt'>('usdt');
  const [chartTimeRange, setChartTimeRange] = useState<'30' | '60' | '90' | 'custom'>('90');
  const [chartDateFrom, setChartDateFrom] = useState<Date | undefined>();
  const [chartDateTo, setChartDateTo] = useState<Date | undefined>();

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
    if (selectedBots.length) qs.set('bot_ids', selectedBots.join(','));
    if (selectedSymbols.length) qs.set('symbols', selectedSymbols.join(','));
    if (dateFrom) qs.set('date_from', dateFrom.toISOString().split('T')[0]);
    if (dateTo) qs.set('date_to', dateTo.toISOString().split('T')[0]);
    if (direction && direction !== 'both') qs.set('direction', direction);
    if (openHourFrom && openHourTo) qs.set('open_hour', `${openHourFrom}-${openHourTo}`);
    if (closeHourFrom && closeHourTo) qs.set('close_hour', `${closeHourFrom}-${closeHourTo}`);

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
  }, [selectedBots, selectedSymbols, dateFrom, dateTo, direction, openHourFrom, openHourTo, closeHourFrom, closeHourTo]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedBots.length > 0) count++;
    if (selectedSymbols.length > 0) count++;
    if (direction && direction !== 'both') count++;
    if (dateFrom || dateTo) count++;
    if (openHourFrom || openHourTo) count++;
    if (closeHourFrom || closeHourTo) count++;
    return count;
  }, [selectedBots, selectedSymbols, direction, dateFrom, dateTo, openHourFrom, openHourTo, closeHourFrom, closeHourTo]);

  const chartData = useMemo(() => {
    if (!summary?.equity_timeseries) return [];
    
    let timeseriesToUse = summary.equity_timeseries;
    
    // Apply chart time range filter
    if (chartTimeRange !== 'custom') {
      const days = parseInt(chartTimeRange);
      // Fill missing days to ensure continuous line
      timeseriesToUse = fillMissingDays(summary.equity_timeseries, days);
    } else if (chartDateFrom && chartDateTo) {
      const daysDiff = Math.ceil((chartDateTo.getTime() - chartDateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const filtered = summary.equity_timeseries.filter(item => {
        const itemDate = new Date(item.ts);
        return itemDate >= chartDateFrom && itemDate <= chartDateTo;
      });
      timeseriesToUse = fillMissingDays(filtered, daysDiff);
    }
    
    return formatChartData(timeseriesToUse, summary.portfolio_total_equity);
  }, [summary, chartTimeRange, chartDateFrom, chartDateTo]);
  
  // Calculate filtered portfolio value from equity timeseries
  const filteredPortfolioValue = useMemo(() => {
    if (!summary?.equity_timeseries || summary.equity_timeseries.length === 0) {
      return summary?.portfolio_total_equity ?? 0;
    }
    // Get the last equity value from the timeseries
    const lastEntry = summary.equity_timeseries[summary.equity_timeseries.length - 1];
    return lastEntry.equity ?? summary.portfolio_total_equity;
  }, [summary]);

  const handleResetFilters = () => {
    setSelectedBots([]);
    setSelectedSymbols([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setDirection('both');
    setOpenHourFrom('');
    setOpenHourTo('');
    setCloseHourFrom('');
    setCloseHourTo('');
  };

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
          <div className="fixed inset-x-0 top-14 bottom-0 bg-background flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-auto">
            <TradesFiltersBar
              selectedBots={selectedBots}
              onBotsChange={setSelectedBots}
              selectedSymbols={selectedSymbols}
              onSymbolsChange={setSelectedSymbols}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              direction={direction}
              onDirectionChange={setDirection}
              openHourFrom={openHourFrom}
              openHourTo={openHourTo}
              onOpenHourFromChange={setOpenHourFrom}
              onOpenHourToChange={setOpenHourTo}
              closeHourFrom={closeHourFrom}
              closeHourTo={closeHourTo}
              onCloseHourFromChange={setCloseHourFrom}
              onCloseHourToChange={setCloseHourTo}
              onResetFilters={handleResetFilters}
              availableBots={bots}
              availableSymbols={symbols}
              showDateRange={true}
              showTimeRange={true}
              txCostsMode={txCostsMode}
              onTxCostsModeChange={setTxCostsMode}
            />
            </div>
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 lg:p-6 space-y-4">
        {/* Desktop Filter Button */}
        <div className="hidden lg:flex justify-end mb-4">
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
              selectedBots={selectedBots}
              onBotsChange={setSelectedBots}
              selectedSymbols={selectedSymbols}
              onSymbolsChange={setSelectedSymbols}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              direction={direction}
              onDirectionChange={setDirection}
              openHourFrom={openHourFrom}
              openHourTo={openHourTo}
              onOpenHourFromChange={setOpenHourFrom}
              onOpenHourToChange={setOpenHourTo}
              closeHourFrom={closeHourFrom}
              closeHourTo={closeHourTo}
              onCloseHourFromChange={setCloseHourFrom}
              onCloseHourToChange={setCloseHourTo}
              onResetFilters={handleResetFilters}
              availableBots={bots}
              availableSymbols={symbols}
              showDateRange={true}
              showTimeRange={true}
              txCostsMode={txCostsMode}
              onTxCostsModeChange={setTxCostsMode}
            />
            <div className="flex justify-end mt-4">
              <Button size="sm" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
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
              <CardTitle className="text-base font-semibold text-center">Portfolio total</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <div className="text-3xl font-bold">{formatUSDT(summary.portfolio_total_equity)}</div>
            </CardContent>
          </Card>

          {/* Gesamtansicht (filtered data) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Gesamtansicht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.overall?.realized_pnl)} />
              <MetricRow label="Portfoliowert" value={formatUSDT(filteredPortfolioValue)} />
              <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.overall?.win_rate, summary.kpis.overall?.trade_count)} />
              <MetricRow label="Anzahl Trades" value={formatNumber(summary.kpis.overall?.trade_count)} />
              <MetricRow label="Offene Trades" value={formatNumber(summary.kpis.current?.open_trades ?? 0)} />
              
              <div className="pt-2">
                <div className="text-sm font-medium mb-2">Transaktionskosten</div>
                <div className="space-y-2 pl-4">
                  {txCostsMode === 'percent' ? (
                    <>
                      <MetricRow label="Gesamt" value={formatPercent(summary.kpis.overall?.tx_costs_pct)} />
                      <MetricRow label="Fees" value={formatPercent((summary.kpis.overall?.tx_breakdown_usdt.fees ?? 0) / (summary.kpis.overall?.realized_pnl ?? 1) * 100)} />
                      <MetricRow label="Funding" value={formatPercent((summary.kpis.overall?.tx_breakdown_usdt.funding ?? 0) / (summary.kpis.overall?.realized_pnl ?? 1) * 100)} />
                      <MetricRow label="Slippage (Liquidität)" value={formatPercent((summary.kpis.overall?.tx_breakdown_usdt.slip_liquidity ?? 0) / (summary.kpis.overall?.realized_pnl ?? 1) * 100)} />
                      <MetricRow label="Slippage (Timelag)" value={formatPercent((summary.kpis.overall?.tx_breakdown_usdt.slip_time ?? 0) / (summary.kpis.overall?.realized_pnl ?? 1) * 100)} />
                    </>
                  ) : (
                    <>
                      <MetricRow label="Gesamt" value={formatUSDT(
                        (summary.kpis.overall?.tx_breakdown_usdt.fees ?? 0) +
                        (summary.kpis.overall?.tx_breakdown_usdt.funding ?? 0) +
                        (summary.kpis.overall?.tx_breakdown_usdt.slip_liquidity ?? 0) +
                        (summary.kpis.overall?.tx_breakdown_usdt.slip_time ?? 0)
                      )} />
                      <MetricRow label="Fees" value={formatUSDT(summary.kpis.overall?.tx_breakdown_usdt.fees)} />
                      <MetricRow label="Funding" value={formatUSDT(summary.kpis.overall?.tx_breakdown_usdt.funding)} />
                      <MetricRow label="Slippage (Liquidität)" value={formatUSDT(summary.kpis.overall?.tx_breakdown_usdt.slip_liquidity)} />
                      <MetricRow label="Slippage (Timelag)" value={formatUSDT(summary.kpis.overall?.tx_breakdown_usdt.slip_time)} />
                    </>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <div className="text-sm font-medium mb-2">Timelag</div>
                <div className="space-y-2 pl-4">
                  <MetricRow label="Entry" value={formatTimelag(summary.kpis.overall?.timelag_ms.entry_ms_avg)} />
                  <MetricRow label="Processing time" value={formatTimelag(summary.kpis.overall?.timelag_ms.engine_ms_avg)} />
                  <MetricRow label="Exit" value={formatTimelag(summary.kpis.overall?.timelag_ms.exit_ms_avg)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Heute */}
          {!hasDateFilters && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Heute</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.today?.realized_pnl)} />
                <MetricRow label="Portfoliowert" value={formatUSDT(summary.portfolio_total_equity)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.today?.win_rate, summary.kpis.today?.wins, summary.kpis.today?.total_trades)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(0)} />
                
                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Transaktionskosten</div>
                  <div className="space-y-2 pl-4">
                    {txCostsMode === 'percent' ? (
                      <>
                        <MetricRow label="Fees" value={formatPercent(summary.kpis.today?.fee_pct)} />
                        <MetricRow label="Slippage (Liquidität)" value={formatPercent(summary.kpis.today?.slip_liq_pct)} />
                        <MetricRow label="Slippage (Timelag)" value={formatPercent(summary.kpis.today?.slip_time_pct)} />
                      </>
                    ) : (
                      <>
                        <MetricRow label="Fees" value={formatUSDT(summary.kpis.today?.fee_usdt)} />
                        <MetricRow label="Slippage (Liquidität)" value={formatUSDT(summary.kpis.today?.slip_liq_usdt)} />
                        <MetricRow label="Slippage (Timelag)" value={formatUSDT(summary.kpis.today?.slip_time_usdt)} />
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Timelag</div>
                  <div className="space-y-2 pl-4">
                    <MetricRow label="Entry" value={formatTimelag(summary.kpis.today?.entry_ms_avg)} />
                    <MetricRow label="Processing time" value={formatTimelag(summary.kpis.today?.engine_ms_avg)} />
                    <MetricRow label="Exit" value={formatTimelag(summary.kpis.today?.exit_ms_avg)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}


          {/* Aktueller Monat */}
          {!hasDateFilters && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Aktueller Monat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.month?.realized_pnl)} />
                <MetricRow label="Portfoliowert" value={formatUSDT(summary.portfolio_total_equity)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.month?.win_rate, summary.kpis.month?.wins, summary.kpis.month?.total_trades)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(0)} />
                
                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Transaktionskosten</div>
                  <div className="space-y-2 pl-4">
                    {txCostsMode === 'percent' ? (
                      <>
                        <MetricRow label="Fees" value={formatPercent(summary.kpis.month?.fee_pct)} />
                        <MetricRow label="Slippage (Liquidität)" value={formatPercent(summary.kpis.month?.slip_liq_pct)} />
                        <MetricRow label="Slippage (Timelag)" value={formatPercent(summary.kpis.month?.slip_time_pct)} />
                      </>
                    ) : (
                      <>
                        <MetricRow label="Fees" value={formatUSDT(summary.kpis.month?.fee_usdt)} />
                        <MetricRow label="Slippage (Liquidität)" value={formatUSDT(summary.kpis.month?.slip_liq_usdt)} />
                        <MetricRow label="Slippage (Timelag)" value={formatUSDT(summary.kpis.month?.slip_time_usdt)} />
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Timelag</div>
                  <div className="space-y-2 pl-4">
                    <MetricRow label="Entry" value={formatTimelag(summary.kpis.month?.entry_ms_avg)} />
                    <MetricRow label="Processing time" value={formatTimelag(summary.kpis.month?.engine_ms_avg)} />
                    <MetricRow label="Exit" value={formatTimelag(summary.kpis.month?.exit_ms_avg)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Letzte 30 Tage */}
          {!hasDateFilters && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Letzte 30 Tage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricRow label="Realized P&L" value={formatUSDT(summary.kpis.last_30d?.realized_pnl)} />
                <MetricRow label="Portfoliowert" value={formatUSDT(summary.portfolio_total_equity)} />
                <MetricRow label="Win Rate" value={formatWinRate(summary.kpis.last_30d?.win_rate, summary.kpis.last_30d?.wins, summary.kpis.last_30d?.total_trades)} />
                <MetricRow label="Anzahl Signale" value={formatNumber(0)} />
                
                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Transaktionskosten</div>
                  <div className="space-y-2 pl-4">
                    {txCostsMode === 'percent' ? (
                      <>
                        <MetricRow label="Fees" value={formatPercent(summary.kpis.last_30d?.fee_pct)} />
                        <MetricRow label="Slippage (Liquidität)" value={formatPercent(summary.kpis.last_30d?.slip_liq_pct)} />
                        <MetricRow label="Slippage (Timelag)" value={formatPercent(summary.kpis.last_30d?.slip_time_pct)} />
                      </>
                    ) : (
                      <>
                        <MetricRow label="Fees" value={formatUSDT(summary.kpis.last_30d?.fee_usdt)} />
                        <MetricRow label="Slippage (Liquidität)" value={formatUSDT(summary.kpis.last_30d?.slip_liq_usdt)} />
                        <MetricRow label="Slippage (Timelag)" value={formatUSDT(summary.kpis.last_30d?.slip_time_usdt)} />
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Timelag</div>
                  <div className="space-y-2 pl-4">
                    <MetricRow label="Entry" value={formatTimelag(summary.kpis.last_30d?.entry_ms_avg)} />
                    <MetricRow label="Processing time" value={formatTimelag(summary.kpis.last_30d?.engine_ms_avg)} />
                    <MetricRow label="Exit" value={formatTimelag(summary.kpis.last_30d?.exit_ms_avg)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Equity Chart - at the bottom */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle>Portfolio Equity</CardTitle>
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                {chartTimeRange === 'custom' && (
                  <div className="flex items-center gap-1 sm:gap-2">
                    <input 
                      type="date" 
                      className="text-xs border border-border bg-background rounded px-1.5 sm:px-2 py-1 w-24 sm:w-auto"
                      value={chartDateFrom?.toISOString().split('T')[0] ?? ''}
                      onChange={(e) => setChartDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                    <span className="text-xs">-</span>
                    <input 
                      type="date" 
                      className="text-xs border border-border bg-background rounded px-1.5 sm:px-2 py-1 w-24 sm:w-auto"
                      value={chartDateTo?.toISOString().split('T')[0] ?? ''}
                      onChange={(e) => setChartDateTo(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </div>
                )}
                <select 
                  className="text-xs border border-border bg-background rounded px-2 py-1"
                  value={chartTimeRange}
                  onChange={(e) => setChartTimeRange(e.target.value as any)}
                >
                  <option value="30">30 Tage</option>
                  <option value="60">60 Tage</option>
                  <option value="90">90 Tage</option>
                  <option value="custom">Manuell</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="linear" 
                      dataKey="Equity" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                      name="Portfolio Equity"
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
      </div>
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
