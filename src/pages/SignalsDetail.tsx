import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import type { TvSignal, OutboxItemExtended, OutboxItem } from '@/lib/api';

type SignalType = 'tv' | 'orders' | 'manual';
type SignalData = TvSignal | OutboxItemExtended | OutboxItem;

export default function SignalsDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const signalId = Number(id);
  const type = (searchParams.get('type') || 'tv') as SignalType;
  
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        let data: SignalData;
        
        if (type === 'tv') {
          data = await api.getTvSignal(signalId);
        } else if (type === 'orders') {
          data = await api.getOutboxItem(signalId);
        } else {
          data = await api.getOutboxById(signalId);
        }
        
        setSignal(data);
      } catch (err: any) {
        console.error('Failed to load signal:', err);
        setError(err.message || 'Failed to load signal');
      }
    })();
  }, [signalId, type]);

  if (error) {
    return (
      <DashboardLayout pageTitle="Signal" mobileHeaderLeft={
        <Button variant="ghost" size="icon" onClick={() => navigate('/signals')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }>
        <div className="p-4">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Error: {error}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!signal) {
    return (
      <DashboardLayout pageTitle="Signal wird geladen…" mobileHeaderLeft={
        <Button variant="ghost" size="icon" onClick={() => navigate('/signals')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }>
        <div className="p-4">
          <p>Lade Signal…</p>
        </div>
      </DashboardLayout>
    );
  }

  const BackButton = (
    <Button 
      variant="ghost" 
      size="icon"
      onClick={() => navigate('/signals')}
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );

  // Type-specific rendering logic
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" => {
    if (['processed', 'sent', 'completed', 'ok'].includes(status)) return 'default';
    if (['error', 'rejected', 'failed'].includes(status)) return 'destructive';
    return 'secondary';
  };

  const statusVariant = getStatusVariant(signal.status);

  // Extract error message if available
  const getErrorMessage = (): string | null => {
    if (type === 'manual') {
      const manualSignal = signal as OutboxItem;
      if (manualSignal.error_message) return manualSignal.error_message;
      if (manualSignal.payload && typeof manualSignal.payload === 'object' && 'error' in manualSignal.payload) {
        return String(manualSignal.payload.error);
      }
    }
    // For other types, check if there's an error field in the data
    if ('error_message' in signal) return (signal as any).error_message;
    if ('error' in signal) return String((signal as any).error);
    return null;
  };

  const errorMessage = getErrorMessage();

  return (
    <DashboardLayout pageTitle={`Signal #${signalId}`} mobileHeaderLeft={BackButton}>
      <div className="space-y-3 p-4 pb-24">
        {/* Header Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              {type === 'tv' ? 'TradingView Signal' : type === 'orders' ? 'Bot Order' : 'Manuelle Aktion'} #{signalId}
            </CardTitle>
            <Badge variant={statusVariant} className="text-xs capitalize">
              {signal.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {type === 'tv' && 'symbol' in signal && (
              <>
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">Symbol</div>
                  <div className="font-medium">{signal.symbol}</div>
                </div>
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">Seite</div>
                  <div className="font-medium capitalize">{(signal as TvSignal).side}</div>
                </div>
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">TradingView Timestamp</div>
                  <div className="font-medium">{new Date((signal as TvSignal).tv_ts).toLocaleString('de-CH')}</div>
                </div>
                {(signal as TvSignal).stop_loss_tv && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Stop Loss (TV)</div>
                    <div className="font-medium">{(signal as TvSignal).stop_loss_tv}</div>
                  </div>
                )}
                {(signal as TvSignal).take_profit_tv && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Take Profit (TV)</div>
                    <div className="font-medium">{(signal as TvSignal).take_profit_tv}</div>
                  </div>
                )}
              </>
            )}
            
            {type === 'orders' && 'symbol' in signal && (
              <>
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">Symbol</div>
                  <div className="font-medium">{signal.symbol}</div>
                </div>
                {'trade_uid' in signal && signal.trade_uid && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Trade UID</div>
                    <div className="font-medium">{signal.trade_uid}</div>
                  </div>
                )}
              </>
            )}

            {type === 'manual' && (
              <div className="text-xs">
                <div className="text-muted-foreground mb-1">Art</div>
                <div className="font-medium capitalize">{(signal as OutboxItem).kind.replace(/_/g, ' ')}</div>
              </div>
            )}

            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Bot ID</div>
              <div className="font-medium">{signal.bot_id}</div>
            </div>

            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Erstellt</div>
              <div className="font-medium">{new Date(signal.created_at).toLocaleString('de-CH')}</div>
            </div>
          </CardContent>
        </Card>

        {/* Error Message Card */}
        {errorMessage && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-sm text-destructive">Fehler</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-destructive">{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Collapsible JSON Section */}
        <Card>
          <Collapsible open={jsonOpen} onOpenChange={setJsonOpen}>
            <CardHeader className="cursor-pointer pb-2" onClick={() => setJsonOpen(!jsonOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Signal (Raw JSON)</CardTitle>
                {jsonOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <pre className="text-[10px] overflow-auto bg-muted/40 rounded p-2 max-h-96">
                  {JSON.stringify(signal, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>
    </DashboardLayout>
  );
}
