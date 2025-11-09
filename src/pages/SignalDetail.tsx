// src/pages/SignalDetail.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

export default function SignalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const signalId = Number(id);
  
  const [signal, setSignal] = useState<any>(null);
  const [jsonOpen, setJsonOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const preview = await api.previewOutbox(signalId);
        setSignal(preview);
      } catch (error) {
        console.error('Failed to load signal:', error);
      }
    })();
  }, [signalId]);

  if (!signal) {
    return (
      <DashboardLayout pageTitle="Signal wird geladen…">
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

  const payload = signal.payload || {};
  const isLong = payload.side === 'long';
  const statusVariant = signal.status === 'sent' || signal.status === 'approved' ? 'default' : signal.status === 'failed' ? 'destructive' : 'secondary';

  return (
    <DashboardLayout pageTitle={`Signal #${signalId}`} mobileHeaderLeft={BackButton}>
      <div className="space-y-3 p-4 pb-24">
        {/* Header Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Outbox #{signalId}</CardTitle>
            <div className="flex gap-1.5">
              <Badge variant={statusVariant} className="text-xs capitalize">
                {signal.status}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">
                {signal.kind}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Created</div>
              <div className="font-medium">{new Date(signal.created_at).toLocaleString('de-CH')}</div>
            </div>
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Updated</div>
              <div className="font-medium">{new Date(signal.updated_at).toLocaleString('de-CH')}</div>
            </div>
            {signal.position_id && (
              <div className="text-xs">
                <div className="text-muted-foreground mb-1">Position ID</div>
                <div className="font-medium">{signal.position_id}</div>
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
