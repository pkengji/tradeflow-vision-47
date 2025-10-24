// src/pages/SignalDetail.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

// Mock signal data - replace with actual API call
const mockSignals = [
  {
    id: 1,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    type: 'entry',
    status: 'completed',
    botId: 1,
    botName: 'Bot Alpha',
    symbol: 'BTCUSDT',
    side: 'long',
    leverage: 10,
    triggerPrice: 42150.50,
    sl: 41000,
    tp: 43500,
    qty: 0.05,
    positionSize: 21075.25,
    tradeId: 'TRD-20240124-001',
    leverageType: 'cross',
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
    side: 'short',
    leverage: 5,
    triggerPrice: 2245.80,
    sl: 2300,
    tp: 2150,
    qty: 2.5,
    positionSize: 5614.50,
    tradeId: 'TRD-20240124-002',
    leverageType: 'isolated',
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
    side: 'long',
    leverage: 20,
    triggerPrice: 0.5234,
    sl: 0.5100,
    tp: 0.5450,
    qty: 10000,
    positionSize: 5234.00,
    tradeId: 'TRD-20240124-003',
    leverageType: 'cross',
    humanMessage: 'Position konnte nicht geschlossen werden - Insufficient margin',
    errorDetails: 'Error: Insufficient margin. Required: 261.7 USDT, Available: 185.3 USDT',
  },
];

export default function SignalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const signalId = Number(id);
  
  // In real app, fetch from API
  const signal = mockSignals.find(s => s.id === signalId);

  const [jsonOpen, setJsonOpen] = useState(false);

  if (!signal) {
    return (
      <DashboardLayout pageTitle="Signal nicht gefunden">
        <div className="p-4">
          <p>Signal mit ID {signalId} wurde nicht gefunden.</p>
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

  const isLong = signal.side === 'long';
  const statusVariant = signal.status === 'completed' ? 'default' : signal.status === 'failed' ? 'destructive' : 'secondary';

  return (
    <DashboardLayout pageTitle={`Signal #${signalId}`} mobileHeaderLeft={BackButton}>
      <div className="space-y-3 p-4 pb-24">
        {/* Header Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Signal #{signalId}</CardTitle>
            <div className="flex gap-1.5">
              <Badge variant={statusVariant} className="text-xs capitalize">
                {signal.status}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">
                {signal.type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground mb-0.5">Symbol</div>
                <div className="font-semibold flex items-center gap-1.5">
                  {signal.symbol}
                  <Badge 
                    variant={isLong ? "default" : "destructive"}
                    className={`${isLong ? 'bg-[#0D3512] hover:bg-[#0D3512]/80 text-[#2DFB68]' : 'bg-[#641812] hover:bg-[#641812]/80 text-[#EA3A10]'} text-[10px] px-1.5 py-0 h-4`}
                  >
                    {signal.side === 'long' ? 'Long' : 'Short'}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Leverage</div>
                <div className="font-semibold">{signal.leverage}x</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Trigger Preis</div>
                <div className="font-semibold">${signal.triggerPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Bot</div>
                <div className="font-semibold">{signal.botName}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground mb-0.5">TP</div>
                <div className="font-semibold">${signal.tp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">SL</div>
                <div className="font-semibold">${signal.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">QTY (Base)</div>
                <div className="font-semibold">{signal.qty.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Positionsgröße</div>
                <div className="font-semibold">{signal.positionSize.toLocaleString()} USDT</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground mb-0.5">Trade ID</div>
                <div className="font-mono text-[10px]">{signal.tradeId}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Leverage Type</div>
                <div className="font-semibold capitalize">{signal.leverageType}</div>
              </div>
            </div>

            <div className="text-xs pt-2">
              <div className="text-muted-foreground mb-1">Nachricht</div>
              <div className="font-medium">{signal.humanMessage}</div>
            </div>

            {signal.status === 'failed' && signal.errorDetails && (
              <div className="text-xs pt-2">
                <div className="text-muted-foreground mb-1">Fehlerdetails</div>
                <div className="font-mono text-red-500 bg-muted/40 rounded p-2">
                  {signal.errorDetails}
                </div>
              </div>
            )}

            {signal.status === 'rejected' && signal.errorDetails && (
              <div className="text-xs pt-2">
                <div className="text-muted-foreground mb-1">Ablehnungsgrund</div>
                <div className="font-mono text-yellow-500 bg-muted/40 rounded p-2">
                  {signal.errorDetails}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
