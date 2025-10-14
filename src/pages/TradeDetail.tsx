import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: position } = useQuery({
    queryKey: ['position', id],
    queryFn: () => api.getPosition(Number(id)),
  });

  if (!position) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const entryPrice = position.entryFillPrice || position.entrySignalPrice;
  const minPrice = Math.min(entryPrice, position.tp || entryPrice, position.sl || entryPrice);
  const maxPrice = Math.max(entryPrice, position.tp || entryPrice, position.sl || entryPrice);
  const priceRange = maxPrice - minPrice;

  const getPosition = (price: number) => {
    if (priceRange === 0) return 50;
    return ((price - minPrice) / priceRange) * 100;
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex items-center gap-4">
        <Link to="/trades">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{position.symbol}</h1>
          <p className="text-muted-foreground">Position Details</p>
        </div>
      </div>

      {/* Price Slider Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Preis-Visualisierung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative h-16 rounded-lg bg-secondary">
              {/* Entry Point */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${getPosition(entryPrice)}%` }}
              >
                <div className="relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <Badge className={position.side === 'long' ? 'bg-success' : 'bg-danger'}>
                      {position.side === 'long' ? (
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-1" />
                      )}
                      Entry
                    </Badge>
                  </div>
                  <div className="h-8 w-1 bg-primary" />
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap">
                    {formatPrice(entryPrice)}
                  </div>
                </div>
              </div>

              {/* Take Profit */}
              {position.tp && (
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${getPosition(position.tp)}%` }}
                >
                  <div className="relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <Badge variant="outline" className="border-success text-success">TP</Badge>
                    </div>
                    <div className="h-8 w-1 bg-success" />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap">
                      {formatPrice(position.tp)}
                    </div>
                  </div>
                </div>
              )}

              {/* Stop Loss */}
              {position.sl && (
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${getPosition(position.sl)}%` }}
                >
                  <div className="relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <Badge variant="outline" className="border-danger text-danger">SL</Badge>
                    </div>
                    <div className="h-8 w-1 bg-danger" />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap">
                      {formatPrice(position.sl)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between text-xs text-muted-foreground pt-6">
              <span>{formatPrice(minPrice)}</span>
              <span>{formatPrice(maxPrice)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Position Info Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Signal vs Fill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="text-sm text-muted-foreground">Signal Preis</div>
              <div className="text-lg font-bold">{formatPrice(position.entrySignalPrice)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Fill Preis</div>
              <div className="text-lg font-bold">{formatPrice(position.entryFillPrice || position.entrySignalPrice)}</div>
            </div>
            {position.slippagePct !== undefined && (
              <div>
                <div className="text-sm text-muted-foreground">Slippage</div>
                <div className="text-lg font-bold text-danger">{position.slippagePct.toFixed(3)}%</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Gebühren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="text-sm text-muted-foreground">Trading Fees</div>
              <div className="text-lg font-bold">{formatPrice(position.tradingFees || 0)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Funding Fees</div>
              <div className="text-lg font-bold">{formatPrice(position.fundingFees || 0)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Gesamt</div>
              <div className="text-lg font-bold">{formatPrice((position.tradingFees || 0) + (position.fundingFees || 0))}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {position.pnl !== undefined && (
              <div>
                <div className="text-sm text-muted-foreground">PnL</div>
                <div className={`text-2xl font-bold ${position.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatPrice(position.pnl)}
                </div>
              </div>
            )}
            {position.pnlPct !== undefined && (
              <div>
                <div className="text-sm text-muted-foreground">PnL %</div>
                <div className={`text-lg font-bold ${position.pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
                  {position.pnlPct > 0 ? '+' : ''}{position.pnlPct.toFixed(2)}%
                </div>
              </div>
            )}
            {position.timelagMs !== undefined && (
              <div>
                <div className="text-sm text-muted-foreground">Timelag</div>
                <div className="text-lg font-bold">{position.timelagMs}ms</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
