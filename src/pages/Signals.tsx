// src/pages/Signals.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import TradesFiltersBar, { type TradesFilters } from '@/components/app/TradesFiltersBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, SlidersHorizontal, Coins } from 'lucide-react';
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
    <Button variant="outline" onClick={go} size="sm">
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
    status: 'completed',
    botId: 1,
    botName: 'Bot Alpha',
    symbol: 'BTCUSDT',
    positionSize: 21075.25,
    humanMessage: 'Position erfolgreich eröffnet',
  },
  {
    id: 2,
    timestamp: new Date(Date.now() - 600000).toISOString(),
    type: 'modify',
    status: 'completed',
    botId: 1,
    botName: 'Bot Alpha',
    symbol: 'ETHUSDT',
    positionSize: 5614.50,
    humanMessage: 'TP/SL erfolgreich angepasst',
  },
  {
    id: 3,
    timestamp: new Date(Date.now() - 900000).toISOString(),
    type: 'exit',
    status: 'failed',
    botId: 2,
    botName: 'Bot Beta',
    symbol: 'XRPUSDT',
    positionSize: 5234.00,
    humanMessage: 'Position konnte nicht geschlossen werden - Insufficient margin',
  },
  {
    id: 4,
    timestamp: new Date(Date.now() - 1200000).toISOString(),
    type: 'exit',
    status: 'rejected',
    botId: 1,
    botName: 'Bot Alpha',
    symbol: 'SOLUSDT',
    positionSize: 3420.80,
    humanMessage: 'Order rejected by exchange - Position not found',
  },
];

export default function Signals() {
  const navigate = useNavigate();
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
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<typeof mockSignals[0] | null>(null);

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

  const handleSignalClick = (signal: typeof mockSignals[0]) => {
    if (signal.status === 'waiting_for_approval') {
      setSelectedSignal(signal);
    } else {
      navigate(`/signal/${signal.id}`);
    }
  };

  const handleApprove = async () => {
    if (!selectedSignal) return;
    try {
      await api.approveOutbox(selectedSignal.id);
      // Reload signals or update state
      setSelectedSignal(null);
    } catch (error) {
      console.error('Failed to approve signal:', error);
    }
  };

  const handleCancel = async () => {
    if (!selectedSignal) return;
    try {
      await api.rejectOutbox(selectedSignal.id);
      // Reload signals or update state
      setSelectedSignal(null);
    } catch (error) {
      console.error('Failed to reject signal:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return <Badge variant="default" className="text-xs bg-[#0D3512] text-[#2DFB68]">completed</Badge>;
    if (status === 'failed') return <Badge variant="destructive" className="text-xs bg-[#641812] text-[#EA3A10]">failed</Badge>;
    if (status === 'rejected') return <Badge variant="secondary" className="text-xs">rejected</Badge>;
    if (status === 'pending') return <Badge variant="secondary" className="text-xs">pending</Badge>;
    if (status === 'waiting_for_approval') return <Badge variant="default" className="text-xs">waiting for approval</Badge>;
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
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

      <div className="p-4 pb-24">
        {/* Filter & Export - Desktop */}
        <div className="hidden lg:flex items-center justify-between gap-2 mb-4">
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
        <div className="divide-y divide-border">
          {mockSignals.map((signal) => (
            <div
              key={signal.id}
              onClick={() => handleSignalClick(signal)}
              className="cursor-pointer hover:bg-muted/30 transition-colors py-2"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                  <Coins className="h-5 w-5 text-primary" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{signal.symbol}</span>
                    <Badge variant="outline" className="text-xs capitalize">{signal.type}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{signal.botName}</div>
                </div>

                {/* Right side */}
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold">{signal.positionSize.toLocaleString()} USDT</div>
                  <div className="mt-0.5">
                    {getStatusBadge(signal.status)}
                  </div>
                </div>
              </div>

              {/* Error message if failed/rejected */}
              {(signal.status === 'failed' || signal.status === 'rejected') && (
                <div className="text-xs text-muted-foreground mt-2 pl-13">
                  {signal.humanMessage}
                </div>
              )}
            </div>
          ))}
          {mockSignals.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">Keine Signals gefunden.</div>
          )}
        </div>

        {/* Action buttons for waiting_for_approval signals */}
        {selectedSignal && selectedSignal.status === 'waiting_for_approval' && (
          <div className="fixed inset-x-0 bottom-16 bg-background border-t p-3 flex gap-3">
            <Button 
              className="flex-1" 
              onClick={handleApprove}
              style={{ backgroundColor: '#0D3512', color: '#2DFB68' }}
            >
              Approve
            </Button>
            <Button 
              className="flex-1" 
              variant="outline"
              onClick={handleCancel}
              style={{ borderColor: '#641812', color: '#EA3A10' }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
