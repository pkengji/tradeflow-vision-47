import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

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
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Signal Log</h1>
          <p className="text-muted-foreground">Überwachung aller Webhook-Events und Systemlogs</p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockSignals.map((signal) => (
              <div
                key={signal.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={signal.status === 'ok' ? 'default' : 'destructive'}>
                      {signal.type}
                    </Badge>
                    <Badge variant="outline">{signal.symbol}</Badge>
                    <span className="text-sm text-muted-foreground">Bot #{signal.botId}</span>
                  </div>
                  <p className="text-sm">{signal.humanMessage}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(signal.timestamp)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Latenz</div>
                    <div className="font-medium">{signal.latencyMs}ms</div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
