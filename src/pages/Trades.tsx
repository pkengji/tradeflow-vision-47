import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';

export default function Trades() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');

  const { data: positionsData } = useQuery({
    queryKey: ['positions', status],
    queryFn: () => api.getPositions({ status }),
  });

  const positions = positionsData?.positions || [];

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-3xl font-bold">Trades</h1>
        <p className="text-muted-foreground">Verwalten Sie Ihre offenen und geschlossenen Positionen</p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as 'open' | 'closed')}>
        <TabsList>
          <TabsTrigger value="open">
            Offen ({positions.filter(p => p.status === 'open').length})
          </TabsTrigger>
          <TabsTrigger value="closed">
            Geschlossen ({positions.filter(p => p.status === 'closed').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={status} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {positions.map((position) => (
              <Card key={position.id} className="hover:border-primary transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{position.symbol}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={position.side === 'long' ? 'default' : 'destructive'}
                          className={position.side === 'long' ? 'bg-success' : 'bg-danger'}
                        >
                          {position.side === 'long' ? (
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                          )}
                          {position.side.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">{position.status}</Badge>
                      </div>
                    </div>
                    {position.pnl !== undefined && (
                      <div className={`text-right ${position.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        <div className="text-lg font-bold">{formatPrice(position.pnl)}</div>
                        {position.pnlPct !== undefined && (
                          <div className="text-sm">{formatPercent(position.pnlPct)}</div>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground">Entry</div>
                      <div className="font-medium">{formatPrice(position.entryFillPrice || position.entrySignalPrice)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Menge</div>
                      <div className="font-medium">{position.qty}</div>
                    </div>
                    {position.tp && (
                      <div>
                        <div className="text-muted-foreground">TP</div>
                        <div className="font-medium">{formatPrice(position.tp)}</div>
                      </div>
                    )}
                    {position.sl && (
                      <div>
                        <div className="text-muted-foreground">SL</div>
                        <div className="font-medium">{formatPrice(position.sl)}</div>
                      </div>
                    )}
                  </div>
                  
                  <Link to={`/trades/${position.id}`}>
                    <Button variant="outline" className="w-full mt-2" size="sm">
                      Details
                      <ExternalLink className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {positions.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">
                  Keine {status === 'open' ? 'offenen' : 'geschlossenen'} Positionen
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
