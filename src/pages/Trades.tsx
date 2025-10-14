import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';

export default function Trades() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');

  const { data: positionsData } = useQuery({
    queryKey: ['positions', status],
    queryFn: () => api.getPositions({ status }),
  });

  const positions = positionsData?.positions || [];

  const formatPrice = (price: number, symbol: string) => {
    const decimals = symbol.includes('XRP') || symbol.includes('ADA') ? 4 : 2;
    return price.toFixed(decimals);
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
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>Bot</TableHead>
                      <TableHead className="text-center">Seite</TableHead>
                      <TableHead className="text-right">Leverage</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Aktuell</TableHead>
                      <TableHead className="text-right">TP</TableHead>
                      <TableHead className="text-right">SL</TableHead>
                      <TableHead className="text-right">PNL</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((position) => (
                      <TableRow key={position.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{position.symbol}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{position.botName}</TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={position.side === 'long' ? 'default' : 'destructive'}
                            className={`${position.side === 'long' ? 'bg-success hover:bg-success/80' : 'bg-danger hover:bg-danger/80'} text-xs`}
                          >
                            {position.side === 'long' ? (
                              <ArrowUpRight className="h-3 w-3 mr-1" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 mr-1" />
                            )}
                            {position.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {position.leverage ? `${position.leverage}x` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPrice(position.entryFillPrice || position.entrySignalPrice, position.symbol)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {position.currentPrice ? formatPrice(position.currentPrice, position.symbol) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-success">
                          {position.tp ? formatPrice(position.tp, position.symbol) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-danger">
                          {position.sl ? formatPrice(position.sl, position.symbol) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`font-semibold ${position.pnl !== undefined && position.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                            {position.pnl !== undefined ? `$${position.pnl.toFixed(2)}` : '-'}
                          </div>
                          {position.pnlPct !== undefined && (
                            <div className={`text-xs ${position.pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
                              {formatPercent(position.pnlPct)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link to={`/trades/${position.id}`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {positions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    Keine {status === 'open' ? 'offenen' : 'geschlossenen'} Positionen
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
