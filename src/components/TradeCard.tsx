import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Position } from '@/types/api';

interface TradeCardProps {
  position: Position;
}

export function TradeCard({ position }: TradeCardProps) {
  const formatPrice = (price: number, symbol: string) => {
    const decimals = symbol.includes('XRP') || symbol.includes('ADA') ? 4 : 2;
    return price.toFixed(decimals);
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
    <Card className="hover:bg-accent/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg">{position.symbol}</h3>
              <Badge 
                variant={position.side === 'long' ? 'default' : 'destructive'}
                className={`${position.side === 'long' ? 'bg-success hover:bg-success/80' : 'bg-danger hover:bg-danger/80'} text-xs h-5`}
              >
                {position.side === 'long' ? (
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 mr-1" />
                )}
                {position.side.toUpperCase()}
                {position.leverage && ` ×${position.leverage}`}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{position.botName}</p>
          </div>
          
          <div className="text-right">
            <div className={`text-xl font-bold ${position.pnl !== undefined && position.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
              {position.pnl !== undefined ? `${position.pnl >= 0 ? '+' : ''}$${position.pnl.toFixed(2)}` : '-'}
            </div>
            {position.pnlPct !== undefined && (
              <div className={`text-sm ${position.pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
                {position.pnlPct > 0 ? '+' : ''}{position.pnlPct.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        {/* Price Visualization Widget */}
        <div className="mb-3">
          <div className="relative h-12 rounded bg-secondary/50">
            {/* Entry Point */}
            <div
              className="absolute top-1/2 -translate-y-1/2 z-10"
              style={{ left: `${getPosition(entryPrice)}%` }}
            >
              <div className="relative flex flex-col items-center">
                <div className="text-[10px] font-medium whitespace-nowrap mb-1">
                  {formatPrice(entryPrice, position.symbol)}
                </div>
                <div className={`h-6 w-0.5 ${position.side === 'long' ? 'bg-success' : 'bg-danger'}`} />
                <div className="text-[10px] text-muted-foreground mt-1">ENTRY</div>
              </div>
            </div>

            {/* Stop Loss */}
            {position.sl && (
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${getPosition(position.sl)}%` }}
              >
                <div className="relative flex flex-col items-center">
                  <div className="text-[10px] text-danger font-medium whitespace-nowrap mb-1">
                    {formatPrice(position.sl, position.symbol)}
                  </div>
                  <div className="h-6 w-0.5 bg-danger/60" />
                  <div className="text-[10px] text-danger mt-1">SL</div>
                </div>
              </div>
            )}

            {/* Take Profit */}
            {position.tp && (
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${getPosition(position.tp)}%` }}
              >
                <div className="relative flex flex-col items-center">
                  <div className="text-[10px] text-success font-medium whitespace-nowrap mb-1">
                    {formatPrice(position.tp, position.symbol)}
                  </div>
                  <div className="h-6 w-0.5 bg-success/60" />
                  <div className="text-[10px] text-success mt-1">TP</div>
                </div>
              </div>
            )}

            {/* Current Price Indicator */}
            {position.currentPrice && (
              <div
                className="absolute top-1/2 -translate-y-1/2 z-20"
                style={{ left: `${getPosition(position.currentPrice)}%` }}
              >
                <div className="relative flex flex-col items-center">
                  <div className="text-[10px] font-bold whitespace-nowrap mb-1 text-primary">
                    {formatPrice(position.currentPrice, position.symbol)}
                  </div>
                  <div className="h-6 w-1 bg-primary" />
                  <div className="text-[10px] font-medium text-primary mt-1">NOW</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Additional Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span>Entry: {formatPrice(entryPrice, position.symbol)}</span>
            {position.currentPrice && (
              <span>Now: {formatPrice(position.currentPrice, position.symbol)}</span>
            )}
          </div>
          <Link to={`/trades/${position.id}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
