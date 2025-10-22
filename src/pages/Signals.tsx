// src/pages/Signals.tsx
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

  return (
    <>
      {/* Filter & Export */}
      <div className="mb-3 flex items-center justify-between">
        <div className="ml-auto flex gap-2">
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
      </div>

      {/* Überschrift */}
      <div className="space-y-6 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Signal Log</h1>
            <p className="text-muted-foreground">Überwachung aller Webhook-Events und Systemlogs</p>
          </div>
        </div>

        {/* Liste */}
        <Card>
          <CardHeader>
            <CardTitle>Letzte Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockSignals.map((signal) => {
                const bot = bots.find(b => b.id === signal.botId);
                return (
                  <div
                    key={signal.id}
                    onClick={() => setSelectedSignal(signal)}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={signal.status === 'ok' ? 'default' : 'destructive'}>
                          {signal.type}
                        </Badge>
                        <Badge variant="outline">{signal.symbol}</Badge>
                        <span className="text-sm text-muted-foreground">{bot?.name || `Bot #${signal.botId}`}</span>
                      </div>
                      <p className="text-sm">{signal.humanMessage}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(signal.timestamp)}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Latenz</div>
                      <div className="font-medium">{signal.latencyMs}ms</div>
                    </div>
                  </div>
                );
              })}
              {mockSignals.length === 0 && (
                <div className="text-sm text-muted-foreground">Keine Signals gefunden.</div>
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
    </>
  );
}
