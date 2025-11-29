// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import api, { type DashboardSummary, type DashboardKPIPeriod } from "@/lib/api";
import TradesFiltersBar, { type TradesFilters } from "@/components/app/TradesFiltersBar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import EquityChart from "@/components/ui/EquityChart";

function zurichToUTC(localHourMin: string): string {
  const [hours, minutes] = localHourMin.split(":").map(Number);
  const now = new Date();
  const isDST = now.getMonth() > 2 && now.getMonth() < 10;
  const offset = isDST ? 2 : 1;
  const utcHours = (hours - offset + 24) % 24;
  return `${String(utcHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dailyPnlData, setDailyPnlData] = useState<Array<{ date: string; pnl: number; equity: number }>>([]);
  const [selectedBots, setSelectedBots] = useState<number[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [direction, setDirection] = useState<string>("both");
  const [openHourFrom, setOpenHourFrom] = useState<string>("");
  const [openHourTo, setOpenHourTo] = useState<string>("");
  const [closeHourFrom, setCloseHourFrom] = useState<string>("");
  const [closeHourTo, setCloseHourTo] = useState<string>("");
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCostAsPercent, setShowCostAsPercent] = useState(false);

  // Chart-specific date filter (independent of other filters)
  const [chartDateRange, setChartDateRange] = useState<string>("30d");
  const [chartDateFrom, setChartDateFrom] = useState<Date | undefined>();
  const [chartDateTo, setChartDateTo] = useState<Date | undefined>();
  const [chartData, setChartData] = useState<Array<{ date: string; pnl: number; equity: number }>>([]);

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
        if (selectedBots.length) params.bot_ids = selectedBots.join(",");
        if (selectedSymbols.length) params.symbols = selectedSymbols.join(",");
        if (direction && direction !== "both") params.direction = direction;
        if (dateFrom) params.date_from = dateFrom.toISOString().split("T")[0];
        if (dateTo) params.date_to = dateTo.toISOString().split("T")[0];
        if (openHourFrom && openHourTo) params.open_hour = `${openHourFrom}-${openHourTo}`;
        if (closeHourFrom && closeHourTo) params.close_hour = `${closeHourFrom}-${closeHourTo}`;

        const [summaryData, dailyData] = await Promise.all([api.getDashboardSummary(params), api.getDailyPnl(params)]);

        setSummary(summaryData);
        setDailyPnlData(dailyData);
      } catch (err) {
        console.error("Error loading dashboard:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [
    selectedBots,
    selectedSymbols,
    direction,
    dateFrom,
    dateTo,
    openHourFrom,
    openHourTo,
    closeHourFrom,
    closeHourTo,
  ]);

  // Separate effect for chart data (only date filter, no other filters)
  useEffect(() => {
    (async () => {
      try {
        const params: any = {};

        // Apply chart date filter
        if (chartDateRange === "custom") {
          if (chartDateFrom) params.date_from = chartDateFrom.toISOString().split("T")[0];
          if (chartDateTo) params.date_to = chartDateTo.toISOString().split("T")[0];
        } else {
          const days = parseInt(chartDateRange);
          const today = new Date();
          const fromDate = new Date(today);
          fromDate.setDate(today.getDate() - days);
          params.date_from = fromDate.toISOString().split("T")[0];
          params.date_to = today.toISOString().split("T")[0];
        }

        const data = await api.getDailyPnl(params);
        setChartData(data);
      } catch (err) {
        console.error("Error loading chart data:", err);
      }
    })();
  }, [chartDateRange, chartDateFrom, chartDateTo]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedBots.length > 0) count++;
    if (selectedSymbols.length > 0) count++;
    if (direction && direction !== "both") count++;
    if (dateFrom || dateTo) count++;
    if (openHourFrom || openHourTo) count++;
    if (closeHourFrom || closeHourTo) count++;
    return count;
  }, [
    selectedBots,
    selectedSymbols,
    direction,
    dateFrom,
    dateTo,
    openHourFrom,
    openHourTo,
    closeHourFrom,
    closeHourTo,
  ]);

  const handleResetFilters = () => {
    setSelectedBots([]);
    setSelectedSymbols([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setDirection("both");
    setOpenHourFrom("");
    setOpenHourTo("");
    setCloseHourFrom("");
    setCloseHourTo("");
  };

  // Helper components
  const MetricRow = ({
    label,
    value,
    highlight = false,
  }: {
    label: string;
    value: string | number;
    highlight?: boolean;
  }) => (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-foreground" : ""}`}>{value}</span>
    </div>
  );

  const renderKPISection = (title: string, kpi: DashboardKPIPeriod | null) => {
    if (!kpi) return null;
    const totalFeesUsdt =
      (kpi.tx_breakdown_usdt?.fees || 0) +
      (kpi.tx_breakdown_usdt?.funding || 0) +
      (kpi.tx_breakdown_usdt?.slip_liquidity || 0) +
      (kpi.tx_breakdown_usdt?.slip_time || 0);
    const totalTimelag =
      (kpi.timelag_ms?.ingress_ms_avg || 0) +
      (kpi.timelag_ms?.engine_ms_avg || 0) +
      (kpi.timelag_ms?.tv_to_fill_ms_avg || 0);

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <MetricRow label="Realisierter P&L" value={formatCurrency(kpi.realized_pnl)} highlight />
          <MetricRow label="Anzahl Trades" value={kpi.trade_count} />
          <MetricRow label="Win Rate" value={`${(kpi.win_rate * 100).toFixed(1)}%`} />

          <div className="pt-2 border-t">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">Transaktionskosten</span>
              <span className="text-sm font-semibold">
                {formatCurrency(totalFeesUsdt)}
              </span>
            </div>
            <MetricRow label="Fees" value={formatCurrency(kpi.tx_breakdown_usdt?.fees || 0)} />
            <MetricRow label="Funding" value={formatCurrency(kpi.tx_breakdown_usdt?.funding || 0)} />
            <MetricRow
              label="Slippage (Liquidität)"
              value={formatCurrency(kpi.tx_breakdown_usdt?.slip_liquidity || 0)}
            />
            <MetricRow label="Slippage (Timelag)" value={formatCurrency(kpi.tx_breakdown_usdt?.slip_time || 0)} />
          </div>

          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-1">Timelag {Math.round(totalTimelag)} ms</div>
            <MetricRow label="Entry" value={`${Math.round(kpi.timelag_ms?.ingress_ms_avg || 0)} ms`} />
            <MetricRow label="Processing" value={`${Math.round(kpi.timelag_ms?.engine_ms_avg || 0)} ms`} />
            <MetricRow label="Exit" value={`${Math.round(kpi.timelag_ms?.tv_to_fill_ms_avg || 0)} ms`} />

            {kpi.timelag_ms?.samples > 0 && <MetricRow label="Samples" value={kpi.timelag_ms.samples} />}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <DashboardLayout pageTitle="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Lädt...</div>
        </div>
      </DashboardLayout>
    );
  }

  const FilterButton = (
    <Button variant="ghost" size="icon" onClick={() => setShowFilters(true)} className="relative">
      <SlidersHorizontal className="h-5 w-5" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  const overallTotalFeesUsdt =
    (summary?.kpis.overall.tx_breakdown_usdt?.fees || 0) +
    (summary?.kpis.overall.tx_breakdown_usdt?.funding || 0) +
    (summary?.kpis.overall.tx_breakdown_usdt?.slip_liquidity || 0) +
    (summary?.kpis.overall.tx_breakdown_usdt?.slip_time || 0);

  return (
    <DashboardLayout
      pageTitle="Dashboard"
      mobileHeaderRight={FilterButton}
      desktopHeaderRight={FilterButton}
    >
      {/* Filter Modal (Mobile) */}
      {showFilters && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Filter</h2>
              <Button size="sm" onClick={() => setShowFilters(false)}>
                Fertig
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
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
                showCostAsPercent={showCostAsPercent}
                onShowCostAsPercentChange={setShowCostAsPercent}
              />
            </div>
          </div>
        </div>
      )}

      <div className="sm:p-4 pb-24 space-y-6">
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
              showCostAsPercent={showCostAsPercent}
              onShowCostAsPercentChange={setShowCostAsPercent}
            />
            <div className="flex justify-end mt-4">
              <Button size="sm" onClick={() => setShowFilters(false)}>
                Fertig
              </Button>
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
              <div className="text-3xl font-bold">{formatCurrency(summary.portfolio_total_equity)}</div>
            </CardContent>
          </Card>
        )}

        {/* Gesamtansicht */}
        {summary?.kpis.overall && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gesamtansicht{activeFilterCount > 0 ? " (gefiltert)" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <MetricRow
                label="Portfoliowert"
                value={formatCurrency(dailyPnlData.length > 0 ? dailyPnlData[dailyPnlData.length - 1].equity : 0)}
                highlight
              />
              <MetricRow label="Realisierter P&L" value={formatCurrency(summary.kpis.overall.realized_pnl)} highlight />
              {summary.cashflows && (
                <MetricRow
                  label={summary.cashflows.net_cashflow_usdt < 0 ? "Einzahlungen" : "Auszahlungen"}
                  value={formatCurrency(Math.abs(summary.cashflows.net_cashflow_usdt))}
                />
              )}
              <MetricRow label="Anzahl Trades" value={summary.kpis.overall.trade_count} />
              <Link to="/trades?tab=open" className="flex justify-between items-center py-0.5 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors cursor-pointer">
                <span className="text-sm text-muted-foreground">Offene Trades</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{summary.kpis.current.open_trades}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
              <MetricRow label="Win Rate" value={`${(summary.kpis.overall.win_rate * 100).toFixed(1)}%`} />

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Transaktionskosten</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(overallTotalFeesUsdt)}
                  </span>
                </div>
                <MetricRow label="Fees" value={formatCurrency(summary.kpis.overall.tx_breakdown_usdt?.fees || 0)} />
                <MetricRow
                  label="Funding"
                  value={formatCurrency(summary.kpis.overall.tx_breakdown_usdt?.funding || 0)}
                />
                <MetricRow
                  label="Slippage (Liquidität)"
                  value={formatCurrency(summary.kpis.overall.tx_breakdown_usdt?.slip_liquidity || 0)}
                />
                <MetricRow
                  label="Slippage (Timelag)"
                  value={formatCurrency(summary.kpis.overall.tx_breakdown_usdt?.slip_time || 0)}
                />
              </div>

              <div className="pt-2 border-t">
                <div className="text-sm font-medium mb-1">Timelag</div>
                <MetricRow
                  label="Gesamt"
                  value={`${Math.round(
                    (summary.kpis.overall.timelag_ms?.ingress_ms_avg || 0) +
                      (summary.kpis.overall.timelag_ms?.engine_ms_avg || 0) +
                      (summary.kpis.overall.timelag_ms?.tv_to_fill_ms_avg || 0),
                  )} ms`}
                />
                <MetricRow
                  label="Entry"
                  value={`${Math.round(summary.kpis.overall.timelag_ms?.ingress_ms_avg || 0)} ms`}
                />
                <MetricRow
                  label="Processing"
                  value={`${Math.round(summary.kpis.overall.timelag_ms?.engine_ms_avg || 0)} ms`}
                />
                <MetricRow
                  label="Exit"
                  value={`${Math.round(summary.kpis.overall.timelag_ms?.tv_to_fill_ms_avg || 0)} ms`}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderKPISection("Heute", summary.kpis.today)}
            {renderKPISection("Aktueller Monat", summary.kpis.month)}
            {renderKPISection("Letzte 30 Tage", summary.kpis.last_30d)}
          </div>
        )}

        {/* Portfolio Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portfolio</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <select
                value={chartDateRange}
                onChange={(e) => setChartDateRange(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="30d">Letzte 30 Tage</option>
                <option value="60d">Letzte 60 Tage</option>
                <option value="90d">Letzte 90 Tage</option>
                <option value="custom">Benutzerdefiniert</option>
              </select>

              {chartDateRange === "custom" && (
                <div className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="date"
                    value={chartDateFrom ? chartDateFrom.toISOString().split("T")[0] : ""}
                    onChange={(e) => setChartDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
                    className="flex-1 sm:flex-none px-3 py-2 border rounded-md bg-background text-sm"
                  />
                  <input
                    type="date"
                    value={chartDateTo ? chartDateTo.toISOString().split("T")[0] : ""}
                    onChange={(e) => setChartDateTo(e.target.value ? new Date(e.target.value) : undefined)}
                    className="flex-1 sm:flex-none px-3 py-2 border rounded-md bg-background text-sm"
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EquityChart data={chartData} />
          </CardContent>
        </Card>
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
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(2).replace(".", ",")} %`;
}

function ms(x: number | null | undefined) {
  if (x == null) return "—";
  return `${x.toFixed(0)} ms`;
}
