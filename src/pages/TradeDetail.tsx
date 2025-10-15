import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PositionOut, OrderOut, FundingEventOut } from '@/types/openapi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: position, isLoading: loadingPosition } = useQuery({
    queryKey: ['position', id],
    queryFn: () => api.getPosition(Number(id)),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.getOrders(Number(id)),
    enabled: !!id,
  });

  const { data: funding = [] } = useQuery({
    queryKey: ['funding', id],
    queryFn: () => api.getFunding(Number(id)),
    enabled: !!id,
  });

  if (loadingPosition || !position) {
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

  const entryPrice = position.entry_price;
  const minPrice = Math.min(entryPrice, position.tp_trigger, position.sl_trigger);
  const maxPrice = Math.max(entryPrice, position.tp_trigger, position.sl_trigger);
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
          <CardTitle>Price Visualization</CardTitle>
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
                    <Badge variant={position.side === 'long' ? 'default' : 'destructive'}>
                      {position.side === 'long' ? (
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-1" />
                      )}
                      ENTRY
                    </Badge>
                  </div>
                  <div className={`h-8 w-1 ${position.side === 'long' ? 'bg-success' : 'bg-danger'}`} />
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap">
                    {formatPrice(entryPrice)}
                  </div>
                </div>
              </div>

              {/* Take Profit */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${getPosition(position.tp_trigger)}%` }}
              >
                <div className="relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <Badge variant="outline" className="border-success text-success">TP</Badge>
                  </div>
                  <div className="h-8 w-1 bg-success" />
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap">
                    {formatPrice(position.tp_trigger)}
                  </div>
                </div>
              </div>

              {/* Stop Loss */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${getPosition(position.sl_trigger)}%` }}
              >
                <div className="relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <Badge variant="outline" className="border-danger text-danger">SL</Badge>
                  </div>
                  <div className="h-8 w-1 bg-danger" />
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap">
                    {formatPrice(position.sl_trigger)}
                  </div>
                </div>
              </div>
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
              <div className="text-sm text-muted-foreground">Entry Price</div>
              <div className="text-lg font-bold">{formatPrice(position.entry_price)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Leverage</div>
              <div className="text-lg font-bold">{position.leverage}x</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Quantity</div>
              <div className="text-lg font-bold">{position.qty}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Gebühren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="text-sm text-muted-foreground">Entry Fees</div>
              <div className="text-lg font-bold">{formatPrice(position.entry_fee_total_usdt)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Exit Fees</div>
              <div className="text-lg font-bold">{formatPrice(position.exit_fee_total_usdt || 0)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Funding Total</div>
              <div className="text-lg font-bold">{formatPrice(position.funding_total_usdt)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {position.realized_pnl_net_usdt !== null && (
              <div>
                <div className="text-sm text-muted-foreground">Net PnL</div>
                <div className={`text-2xl font-bold ${position.realized_pnl_net_usdt >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatPrice(position.realized_pnl_net_usdt)}
                </div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">Risk/Reward</div>
              <div className="text-lg font-bold">{position.rr.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="text-lg font-bold capitalize">{position.status}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
