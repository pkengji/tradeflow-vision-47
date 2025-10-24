// src/pages/Signals.tsx
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, SlidersHorizontal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

// CSV-Export-Button (eigenständig, keine Lib nötig)
function ExportCSV({ url, filename }: { url: string; filename: string }) {
  const go = async () => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { alert('CSV-Export fehlgeschlagen'); return; }
    const txt = await res.text();
    const blob = new Blob([txt], { type: "text/csv" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Button variant="outline" onClick={go}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}

// Mock-Daten (bis Backend-Feed/Filter angeschlossen ist)
const mockSignals = [
  {
    id: 1,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    type: 'entry',
    status: 'ok',
    botId: 1,
    symbol: 'BTCUSDT',
    latencyMs: 145,
    humanMessage: 'Position erfolgreich eröffnet',
  },
  {
    id: 2,
    timestamp: new Date(Date.now() - 600000).toISOString(),
    type: 'modify',
    status: 'ok',
    botId: 1,
    symbol: 'ETHUSDT',
    latencyMs: 89,
    humanMessage: 'TP/SL erfolgreich angepasst',
  },
  {
    id: 3,
    timestamp: new Date(Date.now() - 900000).toISOString(),
    type: 'exit',
    status: 'failed',
    botId: 2,
    symbol: 'XRPUSDT',
    latencyMs: 450,
    humanMessage: 'Position konnte nicht geschlossen werden - Insufficient margin',
  },
];

export default function Signals() {
  const [filters, setFilters] = useState<TradesFilters>({
    botIds: [],
    symbols: [],
    side: 'all',
    dateFrom: undefined,
    dateTo: undefined,
    timeFrom: undefined,
    timeTo: undefined,
    timeMode: 'opened',
    signalKind: 'all',
  });
  const [bots, setBots] = useState<{ id: number; name: string }[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.botIds.length > 0) count++;
    if (filters.symbols.length > 0) count++;
    if (filters.side && filters.side !== 'all') count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.timeFrom || filters.timeTo) count++;
    if (filters.signalKind && filters.signalKind !== 'all') count++;
    return count;
  }, [filters]);

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

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
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
    <DashboardLayout pageTitle="Signals" mobileHeaderRight={FilterButton}>
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
                showSignalKind={true}
              />
            </div>
            <div className="border-t p-3">
              <Button className="w-full" onClick={() => setShowFilters(false)}>Fertig</Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4 p-4 pb-24">
        {/* Filter & Export - Desktop */}
        <div className="hidden lg:flex items-center justify-between gap-2">
          <TradesFiltersBar
            value={filters}
            onChange={setFilters}
            availableBots={bots}
            availableSymbols={symbols}
            showDateRange={true}
            showTimeRange={true}
            showSignalKind={true}
          />
          <ExportCSV url={`/api/v1/export/signals`} filename="signals.csv" />
        </div>

        {/* Liste */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Letzte Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockSignals.map((signal) => {
                const bot = bots.find(b => b.id === signal.botId);
                return (
                  <div
                    key={signal.id}
                    onClick={() => setSelectedSignal(signal)}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={signal.status === 'ok' ? 'default' : 'destructive'} className="text-xs">
                          {signal.type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{signal.symbol}</Badge>
                        <span className="text-xs text-muted-foreground">{bot?.name || `Bot #${signal.botId}`}</span>
                      </div>
                      <p className="text-xs">{signal.humanMessage}</p>
                      <p className="text-[10px] text-muted-foreground">{formatTime(signal.timestamp)}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Latenz</div>
                      <div className="text-sm font-medium">{signal.latencyMs}ms</div>
                    </div>
                  </div>
                );
              })}
              {mockSignals.length === 0 && (
                <div className="text-xs text-muted-foreground">Keine Signals gefunden.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* JSON-Dialog */}
      <Dialog open={!!selectedSignal} onOpenChange={() => setSelectedSignal(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Signal Details</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
            {JSON.stringify(selectedSignal, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
