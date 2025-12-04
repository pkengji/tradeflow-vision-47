import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { ChevronLeft, Calendar as CalendarIcon, Plus, Trash2, Check } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getAllSymbols, type SymbolInfo } from "@/lib/symbols";

// Types
type LiquidityCoverage = {
  symbol: string;
  tracked: boolean;
  first_ts_utc: string | null;
  last_ts_utc: string | null;
  snapshot_count: number;
};

type TrackedSymbol = {
  id: number;
  symbol: string;
  enabled: boolean;
  first_ts_utc: string | null;
  last_ts_utc: string | null;
  snapshot_count: number;
};

type LiquiditySummary = {
  symbol: string;
  side: string;
  snapshots_used: number;
  data_range: {
    first_ts_utc: string;
    last_ts_utc: string;
  };
  filters: {
    date_from: string | null;
    date_to: string | null;
    start_hour: number | null;
    end_hour: number | null;
    weekdays: number[] | null;
    quantiles: number[];
  };
  size_usdt: number | null;
  slippage_quantiles_pct: Record<string, number>;
  slippage_bucket_histogram: Record<string, number>;
  target_slip_pcts: number[];
  max_size_multi_usdt: Record<string, Record<string, number>>;
};

// API functions
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function getLiquidityCoverage(onlyTracked?: boolean): Promise<LiquidityCoverage[]> {
  const url = new URL(`${API_BASE}/api/v1/liquidity/coverage`);
  if (onlyTracked) url.searchParams.set("only_tracked", "true");
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch coverage");
  return res.json();
}

async function getTrackedSymbols(): Promise<TrackedSymbol[]> {
  const res = await fetch(`${API_BASE}/api/v1/liquidity/tracked-symbols`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tracked symbols");
  return res.json();
}

async function updateTrackedSymbols(symbols: { symbol: string; enabled: boolean }[]): Promise<TrackedSymbol[]> {
  const res = await fetch(`${API_BASE}/api/v1/liquidity/tracked-symbols`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ symbols }),
  });
  if (!res.ok) throw new Error("Failed to update tracked symbols");
  return res.json();
}

async function getLiquiditySummary(params: {
  symbol: string;
  side?: string;
  size_usdt?: number;
  target_slip_pcts?: string;
  quantiles?: string;
  date_from?: string;
  date_to?: string;
  start_hour?: number;
  end_hour?: number;
  weekdays?: string;
}): Promise<LiquiditySummary> {
  const url = new URL(`${API_BASE}/api/v1/liquidity/summary`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch liquidity summary");
  return res.json();
}

// Weekday labels (0=Monday, 6=Sunday)
const WEEKDAYS = [
  { value: 0, label: "Mo" },
  { value: 1, label: "Di" },
  { value: 2, label: "Mi" },
  { value: 3, label: "Do" },
  { value: 4, label: "Fr" },
  { value: 5, label: "Sa" },
  { value: 6, label: "So" },
];

export default function SettingsLiquidity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  // Filter states
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [startHour, setStartHour] = useState<string>("");
  const [endHour, setEndHour] = useState<string>("");
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [quantiles, setQuantiles] = useState<number[]>([2, 5, 10, 50]);
  const [quantileInputs, setQuantileInputs] = useState<string[]>(["2", "5", "10", "50"]);

  // Card 1: Slippage by position size
  const [positionSize, setPositionSize] = useState<string>("3000");

  // Card 2: Position size by slippage
  const [targetSlippages, setTargetSlippages] = useState<number[]>([0.02, 0.03, 0.04]);
  const [slippageInputs, setSlippageInputs] = useState<string[]>(["0.02", "0.03", "0.04"]);

  // Admin dialog
  const [trackerDialogOpen, setTrackerDialogOpen] = useState(false);
  const [localTrackedSymbols, setLocalTrackedSymbols] = useState<{ symbol: string; enabled: boolean }[]>([]);
  const [newSymbolSearch, setNewSymbolSearch] = useState("");

  // Query: coverage (symbols with data)
  const { data: coverage = [] } = useQuery({
    queryKey: ["liquidity-coverage"],
    queryFn: () => getLiquidityCoverage(),
  });

  // Query: tracked symbols
  const { data: trackedSymbols = [] } = useQuery({
    queryKey: ["liquidity-tracked"],
    queryFn: getTrackedSymbols,
  });

  // Query: all symbols (for admin dialog)
  const { data: allSymbols = [] } = useQuery<SymbolInfo[]>({
    queryKey: ["allSymbolsInfo"],
    queryFn: getAllSymbols,
    enabled: isAdmin && trackerDialogOpen,
  });

  // Set initial symbol when coverage loads
  useEffect(() => {
    if (coverage.length > 0 && !selectedSymbol) {
      setSelectedSymbol(coverage[0].symbol);
    }
  }, [coverage, selectedSymbol]);

  // Initialize local tracked symbols when dialog opens
  useEffect(() => {
    if (trackerDialogOpen && trackedSymbols.length > 0) {
      setLocalTrackedSymbols(
        trackedSymbols.map((t) => ({ symbol: t.symbol, enabled: t.enabled }))
      );
    }
  }, [trackerDialogOpen, trackedSymbols]);

  // Build query params
  const queryParams = useMemo(() => {
    if (!selectedSymbol) return null;

    const params: any = {
      symbol: selectedSymbol,
      side: "both",
      quantiles: quantiles.join(","),
      target_slip_pcts: targetSlippages.join(","),
    };

    if (positionSize && parseFloat(positionSize) > 0) {
      params.size_usdt = parseFloat(positionSize);
    }

    if (dateFrom) {
      const y = dateFrom.getFullYear();
      const m = String(dateFrom.getMonth() + 1).padStart(2, "0");
      const d = String(dateFrom.getDate()).padStart(2, "0");
      params.date_from = `${y}-${m}-${d}T00:00:00Z`;
    }
    if (dateTo) {
      const y = dateTo.getFullYear();
      const m = String(dateTo.getMonth() + 1).padStart(2, "0");
      const d = String(dateTo.getDate()).padStart(2, "0");
      params.date_to = `${y}-${m}-${d}T23:59:59Z`;
    }
    if (startHour) {
      const h = parseInt(startHour.split(":")[0], 10);
      if (!isNaN(h)) params.start_hour = h;
    }
    if (endHour) {
      const h = parseInt(endHour.split(":")[0], 10);
      if (!isNaN(h)) params.end_hour = h;
    }
    if (weekdays.length < 7 && weekdays.length > 0) {
      params.weekdays = weekdays.join(",");
    }

    return params;
  }, [selectedSymbol, positionSize, quantiles, targetSlippages, dateFrom, dateTo, startHour, endHour, weekdays]);

  // Query: liquidity summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["liquidity-summary", queryParams],
    queryFn: () => getLiquiditySummary(queryParams!),
    enabled: !!queryParams,
  });

  // Update tracked symbols mutation
  const updateMutation = useMutation({
    mutationFn: updateTrackedSymbols,
    onSuccess: () => {
      toast.success("Tracking-Liste aktualisiert");
      qc.invalidateQueries({ queryKey: ["liquidity-tracked"] });
      qc.invalidateQueries({ queryKey: ["liquidity-coverage"] });
      setTrackerDialogOpen(false);
    },
    onError: () => {
      toast.error("Fehler beim Speichern");
    },
  });

  // Handle quantile input change (allow any value while editing)
  const handleQuantileChange = (index: number, value: string) => {
    const newInputs = [...quantileInputs];
    newInputs[index] = value;
    setQuantileInputs(newInputs);
  };

  // Handle quantile blur - validate and clamp to 1-99
  const handleQuantileBlur = (index: number) => {
    const value = quantileInputs[index];
    const num = parseInt(value, 10);
    const clamped = isNaN(num) || num < 1 ? 1 : num > 99 ? 99 : num;
    
    const newInputs = [...quantileInputs];
    newInputs[index] = String(clamped);
    setQuantileInputs(newInputs);
    
    const newQuantiles = [...quantiles];
    newQuantiles[index] = clamped;
    setQuantiles(newQuantiles);
  };

  // Handle slippage input change (allow any value while editing)
  const handleSlippageChange = (index: number, value: string) => {
    const newInputs = [...slippageInputs];
    newInputs[index] = value;
    setSlippageInputs(newInputs);
  };

  // Handle slippage blur - validate
  const handleSlippageBlur = (index: number) => {
    const value = slippageInputs[index];
    const num = parseFloat(value);
    
    if (!isNaN(num) && num > 0) {
      const newSlippages = [...targetSlippages];
      newSlippages[index] = num;
      setTargetSlippages(newSlippages);
    } else {
      // Reset to previous valid value
      const newInputs = [...slippageInputs];
      newInputs[index] = String(targetSlippages[index]);
      setSlippageInputs(newInputs);
    }
  };

  // Toggle weekday
  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  // Toggle tracked symbol
  const toggleTrackedSymbol = (symbol: string) => {
    setLocalTrackedSymbols((prev) => {
      const existing = prev.find((s) => s.symbol === symbol);
      if (existing) {
        return prev.map((s) => (s.symbol === symbol ? { ...s, enabled: !s.enabled } : s));
      }
      return [...prev, { symbol, enabled: true }];
    });
  };

  // Remove tracked symbol (set enabled=false)
  const removeTrackedSymbol = (symbol: string) => {
    setLocalTrackedSymbols((prev) =>
      prev.map((s) => (s.symbol === symbol ? { ...s, enabled: false } : s))
    );
  };

  // Format number with ' as thousand separator and . as decimal separator
  const formatNumber = (n: number, decimals = 0): string => {
    const fixed = n.toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return decPart ? `${withThousands}.${decPart}` : withThousands;
  };

  // Get first_ts_utc for selected symbol
  const selectedCoverage = coverage.find((c) => c.symbol === selectedSymbol);
  const firstTsLocal = selectedCoverage?.first_ts_utc
    ? format(new Date(selectedCoverage.first_ts_utc), "dd.MM.yyyy HH:mm", { locale: de })
    : "—";

  const BackButton = (
    <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
      <ChevronLeft className="h-5 w-5" />
    </Button>
  );

  // Filtered symbols for add dialog
  const availableSymbolsForAdd = useMemo(() => {
    const tracked = new Set(localTrackedSymbols.filter((s) => s.enabled).map((s) => s.symbol));
    return allSymbols
      .map((s) => s.symbol)
      .filter((sym) => !tracked.has(sym))
      .filter((sym) => sym.toLowerCase().includes(newSymbolSearch.toLowerCase()));
  }, [allSymbols, localTrackedSymbols, newSymbolSearch]);

  return (
    <DashboardLayout
      pageTitle="Liquiditätstracker"
      mobileHeaderLeft={BackButton}
      desktopHeaderLeft={BackButton}
    >
      <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
        {/* Symbol Selector */}
        <div className="space-y-2">
          <Label>Symbol</Label>
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger>
              <SelectValue placeholder="Symbol auswählen" />
            </SelectTrigger>
            <SelectContent>
              {coverage.map((c) => (
                <SelectItem key={c.symbol} value={c.symbol}>
                  {c.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label className="text-xs">Datumsbereich</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateFrom || dateTo
                      ? `${dateFrom ? format(dateFrom, "dd.MM.yyyy") : "..."} - ${dateTo ? format(dateTo, "dd.MM.yyyy") : "..."}`
                      : "Datum wählen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 space-y-2">
                    <div className="text-xs font-medium">Von</div>
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      className="pointer-events-auto"
                    />
                    <div className="text-xs font-medium mt-2">Bis</div>
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      className="pointer-events-auto"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Range */}
            <div className="space-y-2">
              <Label className="text-xs">Uhrzeit</Label>
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="text-sm"
                  placeholder="Von"
                />
                <Input
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="text-sm"
                  placeholder="Bis"
                />
              </div>
            </div>

            {/* Weekdays */}
            <div className="space-y-2">
              <Label className="text-xs">Wochentage</Label>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAYS.map((day) => (
                  <Button
                    key={day.value}
                    size="sm"
                    variant={weekdays.includes(day.value) ? "default" : "outline"}
                    onClick={() => toggleWeekday(day.value)}
                    className="w-10"
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Quantiles */}
            <div className="space-y-2">
              <Label className="text-xs">Quantile (%)</Label>
              <div className="flex gap-2">
                {quantileInputs.map((val, i) => (
                  <Input
                    key={i}
                    type="text"
                    inputMode="numeric"
                    value={val}
                    onChange={(e) => handleQuantileChange(i, e.target.value)}
                    onBlur={() => handleQuantileBlur(i)}
                    className="w-16 text-sm text-center"
                  />
                ))}
              </div>
            </div>

            {/* Data collected since */}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              Daten erfasst seit: {firstTsLocal}
            </div>
          </CardContent>
        </Card>

        {/* Card 1: Slippage by Position Size */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Slippage nach Positionsgrösse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Positionsgrösse (USDT)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                placeholder="z.B. 3000"
              />
            </div>

            {summaryLoading ? (
              <div className="text-sm text-muted-foreground">Lade...</div>
            ) : summary?.slippage_quantiles_pct ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 font-medium">Quantil</th>
                      <th className="text-right p-2 font-medium">Slippage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantiles.map((q) => {
                      const slippage = summary.slippage_quantiles_pct[String(q)];
                      return (
                        <tr key={q} className="border-t">
                          <td className="p-2">{q}%</td>
                          <td className="p-2 text-right">
                            {slippage !== undefined ? `${slippage}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Daten verfügbar</div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Position Size by Slippage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Positionsgrösse nach Slippage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Ziel-Slippages (%)</Label>
              <div className="flex gap-2">
                {slippageInputs.map((val, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => handleSlippageChange(i, e.target.value)}
                      onBlur={() => handleSlippageBlur(i)}
                      className="w-20 text-sm text-center"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                ))}
              </div>
            </div>

            {summaryLoading ? (
              <div className="text-sm text-muted-foreground">Lade...</div>
            ) : summary?.max_size_multi_usdt ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 font-medium">Quantil</th>
                      {targetSlippages.slice(0, 2).map((slip) => (
                        <th key={slip} className="text-right p-2 font-medium">
                          {slip}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quantiles.map((q) => (
                      <tr key={q} className="border-t">
                        <td className="p-2">{q}%</td>
                        {targetSlippages.slice(0, 2).map((slip) => {
                          const slipKey = String(slip);
                          const sizeData = summary.max_size_multi_usdt?.[slipKey];
                          const size = sizeData?.[String(q)];
                          return (
                            <td key={slip} className="p-2 text-right">
                              {size != null ? formatNumber(size) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Daten verfügbar</div>
            )}
          </CardContent>
        </Card>

        {/* Admin Button */}
        {isAdmin && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setTrackerDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Getrackte Symbole verwalten
          </Button>
        )}

        {/* Admin Dialog */}
        <Dialog open={trackerDialogOpen} onOpenChange={setTrackerDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Getrackte Symbole</DialogTitle>
              <DialogDescription>
                Verwalte die Symbole, die im Liquiditätstracker erfasst werden.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-auto space-y-4">
              {/* Currently tracked symbols */}
              <div className="space-y-2">
                <Label className="text-xs">Aktive Symbole</Label>
                <div className="space-y-1 max-h-48 overflow-auto border rounded-lg p-2">
                  {localTrackedSymbols
                    .filter((s) => s.enabled)
                    .map((s) => (
                      <div
                        key={s.symbol}
                        className="flex items-center justify-between py-1 px-2 hover:bg-muted rounded"
                      >
                        <span className="text-sm">{s.symbol}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeTrackedSymbol(s.symbol)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  {localTrackedSymbols.filter((s) => s.enabled).length === 0 && (
                    <div className="text-sm text-muted-foreground p-2">
                      Keine Symbole aktiv
                    </div>
                  )}
                </div>
              </div>

              {/* Add new symbols */}
              <div className="space-y-2">
                <Label className="text-xs">Symbol hinzufügen</Label>
                <Input
                  placeholder="Symbol suchen..."
                  value={newSymbolSearch}
                  onChange={(e) => setNewSymbolSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-auto border rounded-lg">
                  {availableSymbolsForAdd.slice(0, 50).map((sym) => (
                    <div
                      key={sym}
                      className="flex items-center justify-between py-1 px-3 hover:bg-muted cursor-pointer"
                      onClick={() => toggleTrackedSymbol(sym)}
                    >
                      <span className="text-sm">{sym}</span>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                  {availableSymbolsForAdd.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3">
                      Keine Symbole gefunden
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setTrackerDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                className="flex-1"
                onClick={() => updateMutation.mutate(localTrackedSymbols)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
