// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';

// ---- Backend Summary Typen ----
type TxBreakdown = {
  fees?: number;
  funding?: number;
  slip_liq?: number;
  slip_time?: number;
};

type TimelagMs = {
  tv_bot_avg?: number;
  bot_ex_avg?: number;
};

type KpiSlice = {
  realized_pnl?: number;
  win_rate?: number;
  tx_breakdown?: TxBreakdown;
  timelag_ms?: TimelagMs;
};

type BackendSummary = {
  portfolio_total_equity: number;
  kpis: {
    today?: KpiSlice;
    month?: KpiSlice;
    last_30d?: KpiSlice;
    current?: {
      open_trades?: number;
      filtered_portfolio_equity?: number;
      win_rate?: number;
    };
  };
  equity_timeseries?: Array<{ ts: string; day_pnl: number }>;
};

type DailyPnl = { date: string; pnl: number; equity: number };
type BotLite = { id: number; name: string };

export default function Dashboard() {
  const [summary, setSummary] = useState<BackendSummary | null>(null);
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

  // Wichtig: Bots nur noch via /api/v1/bots (getBots wurde entfernt)
  const [bots, setBots] = useState<BotLite[]>([]);
  // Symbolliste soll ALLE historischen Pairs umfassen (nicht Whitelist)
  const [symbols, setSymbols] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // ---- Loader für Bots & (historische) Symbols ----
  useEffect(() => {
    (async () => {
      // Bots laden (nur id+name)
      try {
        const botRows = await apiRequest<any[]>('/api/v1/bots');
        setBots((botRows ?? []).map(b => ({ id: b.id, name: b.name })));
      } catch {
        setBots([]);
      }

      // Historische Symbols (Distinct aus Trades); Fallback: globale Symbol-Liste
      try {
        const hist = await apiRequest<string[]>('/api/v1/trades/symbols');
        if (Array.isArray(hist) && hist.length) {
          setSymbols(hist);
        } else {
          throw new Error('no historic symbols');
        }
      } catch {
        try {
          const all = await api.getSymbols();
          setSymbols(all ?? []);
        } catch {
          setSymbols([]);
        }
      }
    })();
  }, []);

  // ---- Daten laden (Summary + Outbox + Daily PnL) ----
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.botIds.length) qs.set('bot_ids', filters.botIds.join(','));
    if (filters.symbols.length) qs.set('symbols', filters.symbols.join(','));
    if (filters.dateFrom) qs.set('date_from', filters.dateFrom.toISOString().split('T')[0]); // Backend erwartet date_from/date_to
    if (filters.dateTo) qs.set('date_to', filters.dateTo.toISOString().split('T')[0]);
    if (filters.timeFrom) qs.set('open_hour', filters.timeFrom); // "HH:MM-HH:MM" – wir übergeben hier nur start
    if (filters.timeTo) qs.set('close_hour', filters.timeTo);    // und hier end

    (async () => {
      // 1) Summary + Outbox
      try {
        const [s, outboxRes] = await Promise.all([
          apiRequest<BackendSummary>(`/api/v1/dashboard/summary?${qs.toString()}`),
          api.getOutbox()
        ]);
        setSummary(s);

        // TV-Signale zählen (nur als UI-Info)
        const tvSignals = (outboxRes ?? []).filter((item: any) => item.kind === 'tradingview');
        const todayStr = new Date().toISOString().split('T')[0];
        const tvSignalsToday = tvSignals.filter((item: any) => item.created_at?.startsWith(todayStr));

        const now = new Date();
        const firstDayOfMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const tvSignalsMTD = tvSignals.filter((item: any) => item.created_at && item.created_at >= firstDayOfMonth);
        const tvSignalsLast30D = tvSignals.filter((item: any) => item.created_at && item.created_at >= thirtyDaysAgo);

        setSignalsCount({
          total: tvSignals.length,
          today: tvSignalsToday.length,
          mtd: tvSignalsMTD.length,
          last30d: tvSignalsLast30D.length
        });
      } catch {
        setSummary(null);
      }

      // 2) Daily PnL Serie (separater Endpoint)
      try {
        const d = await apiRequest<DailyPnl[]>(`/api/v1/dashboard/daily-pnl?${qs.toString()}`);
        setSeries(d ?? []);
      } catch {
        setSeries([]);
      }
    })();
  }, [filters]);

  const hasDateFilter = !!(filters.dateFrom || filters.dateTo);
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
    <Button variant="ghost" size="icon" onClick={() => setShowFilters(!showFilters)} className="relative">
      <SlidersHorizontal className="h-5 w-5" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  // Hilfsfunktionen zur Anzeige aus Backend-KPIs
  const portfolioTotal = summary?.portfolio_total_equity ?? 0;

  const today = summary?.kpis?.today;
  const month = summary?.kpis?.month;
  const last30d = summary?.kpis?.last_30d;
  const current = summary?.kpis?.current;

  // Anzeige-Helfer
  const todayPnl = today?.realized_pnl ?? 0;
  const todayWr = today?.win_rate ?? 0;
  const todayFeesTotal = (today?.tx_breakdown?.fees ?? 0) + (today?.tx_breakdown?.funding ?? 0);
  const todayFees = today?.tx_breakdown?.fees ?? 0;
  const todayFunding = today?.tx_breakdown?.funding ?? 0;
  const todaySlipLiq = today?.tx_breakdown?.slip_liq ?? 0;
  const todaySlipTime = today?.tx_breakdown?.slip_time ?? 0;
  const todayTvBot = today?.timelag_ms?.tv_bot_avg ?? 0;
  const todayBotEx = today?.timelag_ms?.bot_ex_avg ?? 0;

  const filteredEquity = current?.filtered_portfolio_equity ?? portfolioTotal;
  const filteredWR = current?.win_rate ?? 0;

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

        {/* 1. Portfoliowert total */}
        {summary && (
          <Card className="border-primary/50">
            <CardContent className="pt-4 pb-4">
              <div className="text-center">
                <div className="text-[var(--font-size-subsection-title)] text-muted-foreground mb-1">Portfolio total</div>
                <div className="text-[var(--font-size-value-large)] font-bold text-foreground">
                  {formatCurrency(portfolioTotal)}
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
              <div className="space-y-0">
                {/* Realized P&L gefiltert: wir nutzen hier die Summe der Time-Series innerhalb des Filterfensters nicht; optional später */}
                <MetricRow label="Realized P&L" value={formatCurrency(0)} />
                <MetricRow label="Portfoliowert" value={formatCurrency(filteredEquity)} />
                <MetricRow label="Win Rate" value={pct(filteredWR)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.total)} />
              </div>

              {/* Transaktionskosten */}
              <div className="space-y-0 pt-0.5">
                <MetricRow label="Transaktionskosten" value={pct(0)} />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees (Opening+Closing)" value={pct(0)} small />
                  <MetricRow label="Funding Fee" value={pct(0)} small />
                  <MetricRow label="Slippage (Liquidität)" value={pct(0)} small />
                  <MetricRow label="Slippage (Timelag)" value={pct(0)} small />
                </div>
              </div>

              {/* Timelag (gefiltert – aktuell 0 bis echte Daten vorliegen) */}
              <div className="space-y-0 pt-0.5">
                <MetricRow 
                  label="Timelag" 
                  value={ms(0)} 
                />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(0)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(0)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 3. Heute */}
        {summary && !hasDateFilter && (
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Heute</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 py-2 pb-3">
              <div className="space-y-0">
                <Link to="/trades?status=closed"><MetricRow label="P&L realized heute" value={formatCurrency(todayPnl)} hoverable /></Link>
                <MetricRow label="Win Rate heute" value={pct(todayWr)} />
                <MetricRow label="Anzahl Signale" value={String(signalsCount.today)} />
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow label="Transaktionskosten" value={pct(todayFeesTotal)} />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Fees (Opening+Closing)" value={pct(todayFees)} small />
                  <MetricRow label="Funding Fee" value={pct(todayFunding)} small />
                  <MetricRow label="Slippage (Liquidität)" value={pct(todaySlipLiq)} small />
                  <MetricRow label="Slippage (Timelag)" value={pct(todaySlipTime)} small />
                </div>
              </div>

              <div className="space-y-0 pt-0.5">
                <MetricRow label="Timelag" value={ms((todayTvBot ?? 0) + (todayBotEx ?? 0))} />
                <div className="pl-4 space-y-0">
                  <MetricRow label="Entry" value={ms(todayTvBot)} small />
                  <MetricRow label="Processing time" value={ms(0)} small />
                  <MetricRow label="Exit" value={ms(todayBotEx)} small />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Aktueller Monat */}
        {summary && !hasDateFilter && <KpiCard title="Aktueller Monat" k={month} signals={signalsCount.mtd} />}

        {/* 5. Letzte 30 Tage */}
        {summary && !hasDateFilter && <KpiCard title="Letzte 30 Tage" k={last30d} signals={signalsCount.last30d} />}

        {/* 6. Equity-Chart (nutzt /api/v1/dashboard/daily-pnl) */}
        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[var(--font-size-page-title)] font-semibold">Portfoliowert / Tages-P&L</CardTitle>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                <XAxis dataKey="date" className="text-xs" tickFormatter={(value) => formatDate(value)} />
                <YAxis yAxisId="left" className="text-xs" tickFormatter={(value) => formatCurrencyShort(value)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
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
                <Line yAxisId="left" type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} name="equity" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// KPI-Karte direkt auf Backend-Schema
function KpiCard({ title, k, signals }: { title: string; k?: KpiSlice; signals: number }) {
  const pnl = k?.realized_pnl ?? 0;
  const wr = k?.win_rate ?? 0;
  const feesTotal = ((k?.tx_breakdown?.fees ?? 0) + (k?.tx_breakdown?.funding ?? 0));
  const fees = (k?.tx_breakdown?.fees ?? 0);
  const funding = (k?.tx_breakdown?.funding ?? 0);
  const slipLiq = (k?.tx_breakdown?.slip_liq ?? 0);
  const slipTime = (k?.tx_breakdown?.slip_time ?? 0);
  const tvBot = k?.timelag_ms?.tv_bot_avg ?? 0;
  const botEx = k?.timelag_ms?.bot_ex_avg ?? 0;

  return (
    <Card>
      <CardHeader className="pb-1 pt-3">
        <CardTitle className="text-[var(--font-size-page-title)] font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 py-2 pb-3">
        <div className="space-y-0">
          <MetricRow label="Realized P&L" value={formatCurrency(pnl)} />
          <MetricRow label="Win Rate" value={pct(wr)} />
          <MetricRow label="Anzahl Signale" value={String(signals)} />
        </div>
        <div className="space-y-0 pt-0.5">
          <MetricRow label="Transaktionskosten" value={pct(feesTotal)} />
          <div className="pl-4 space-y-0">
            <MetricRow label="Fees (Opening+Closing)" value={pct(fees)} small />
            <MetricRow label="Funding Fee" value={pct(funding)} small />
            <MetricRow label="Slippage (Liquidität)" value={pct(slipLiq)} small />
            <MetricRow label="Slippage (Timelag)" value={pct(slipTime)} small />
          </div>
        </div>
        <div className="space-y-0 pt-0.5">
          <MetricRow label="Timelag" value={ms((tvBot ?? 0) + (botEx ?? 0))} />
          <div className="pl-4 space-y-0">
            <MetricRow label="Entry" value={ms(tvBot)} small />
            <MetricRow label="Processing time" value={ms(0)} small />
            <MetricRow label="Exit" value={ms(botEx)} small />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper Components
function MetricRow({ label, value, hoverable = false, small = false }: { label: string; value: string | number; hoverable?: boolean; small?: boolean; }) {
  return (
    <div className={`flex justify-between items-center py-0.5 ${hoverable ? 'hover:bg-muted/30 rounded px-2 -mx-2 cursor-pointer transition-colors' : ''}`}>
      <span className={`${small ? 'text-xs text-muted-foreground' : 'text-sm text-foreground'}`}>{label}</span>
      <span className={`${small ? 'text-xs text-muted-foreground' : 'text-sm text-foreground'}`}>{value}</span>
    </div>
  );
}

// Format-Helper
function formatCurrencyShort(value: number) {
  if (Math.abs(value) >= 1000) return `$ ${(value / 1000).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}k`;
  return `$ ${value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}
function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}
function pct(v: number | null | undefined) { if (v == null) return '—'; return `${(v * 100).toFixed(2).replace('.', ',')} %`; }
function ms(x: number | null | undefined) { if (x == null) return '—'; return `${x.toFixed(0)} ms`; }
