import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Position } from '@/types/api';
import { formatPrice, formatCurrency } from '@/lib/formatters';

interface TradeCardProps {
  position: Position;
}

export function TradeCard({ position }: TradeCardProps) {
  const isLong = position.side === 'long';

  const entryPrice = position.entry_price_vwap || position.entry_price;
  const currentPrice = position.current_price || entryPrice;
  
  // For shorts, reverse the display so higher values are on the right
  const sl = position.sl || entryPrice;
  const tp = position.tp || entryPrice;
  
  const minPrice = Math.min(entryPrice, sl, tp, currentPrice);
  const maxPrice = Math.max(entryPrice, sl, tp, currentPrice);
  const priceRange = maxPrice - minPrice;

  const getPosition = (price: number) => {
    if (priceRange === 0) return 50;
    if (isLong) {
      return ((price - minPrice) / priceRange) * 100;
    } else {
      // For shorts, reverse the scale
      return ((maxPrice - price) / priceRange) * 100;
    }
  };

  return (
    <Card className="hover:bg-accent/50 transition-colors shadow-md">
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base truncate">{position.symbol}</h3>
              <Badge 
                variant={isLong ? 'default' : 'destructive'}
                className={`${isLong ? 'bg-[hsl(var(--long))] hover:bg-[hsl(var(--long))]/80 text-[hsl(var(--long-foreground))]' : 'bg-[hsl(var(--short))] hover:bg-[hsl(var(--short))]/80 text-[hsl(var(--short-foreground))]'} text-xs px-2 py-0`}
              >
                {position.side.toUpperCase()}
                {position.leverage && ` ×${position.leverage}`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{position.bot_name}</p>
          </div>
          
          <div className="text-right ml-2">
            <div className={`text-lg font-bold ${position.pnl !== undefined && position.pnl >= 0 ? 'text-[hsl(var(--long))]' : 'text-[hsl(var(--short))]'}`}>
              {position.pnl !== undefined ? `${formatCurrency(position.pnl, true)}` : '—'}
            </div>
            {position.pnl_pct !== undefined && (
              <div className={`text-xs ${position.pnl_pct >= 0 ? 'text-[hsl(var(--long))]' : 'text-[hsl(var(--short))]'}`}>
                {position.pnl_pct > 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        {/* Price Visualization Widget */}
        <div className="mb-2">
          <div className="relative h-10 rounded bg-secondary/50">
            {/* Entry Point */}
            <div
              className="absolute top-1/2 -translate-y-1/2 z-10"
              style={{ left: `${getPosition(entryPrice)}%` }}
            >
              <div className="relative flex flex-col items-center">
                <div className="text-[10px] font-medium whitespace-nowrap mb-0.5">
                  {formatPrice(entryPrice)}
                </div>
                <div className={`h-5 w-0.5 ${isLong ? 'bg-[hsl(var(--long))]' : 'bg-[hsl(var(--short))]'}`} />
                <div className="text-[9px] text-muted-foreground mt-0.5">ENTRY</div>
              </div>
            </div>

            {/* Stop Loss */}
            {position.sl && (
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${getPosition(position.sl)}%` }}
              >
                <div className="relative flex flex-col items-center">
                  <div className="text-[10px] text-[hsl(var(--short))] font-medium whitespace-nowrap mb-0.5">
                    {formatPrice(position.sl)}
                  </div>
                  <div className="h-5 w-0.5 bg-[hsl(var(--short))]/60" />
                  <div className="text-[9px] text-[hsl(var(--short))] mt-0.5">SL</div>
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
                  <div className="text-[10px] text-[hsl(var(--long))] font-medium whitespace-nowrap mb-0.5">
                    {formatPrice(position.tp)}
                  </div>
                  <div className="h-5 w-0.5 bg-[hsl(var(--long))]/60" />
                  <div className="text-[9px] text-[hsl(var(--long))] mt-0.5">TP</div>
                </div>
              </div>
            )}

            {/* Current Price Indicator */}
            {position.current_price && (
              <div
                className="absolute top-1/2 -translate-y-1/2 z-20"
                style={{ left: `${getPosition(position.current_price)}%` }}
              >
                <div className="relative flex flex-col items-center">
                  <div className="text-[10px] font-bold whitespace-nowrap mb-0.5 text-primary">
                    {formatPrice(position.current_price)}
                  </div>
                  <div className="h-5 w-1 bg-primary" />
                  <div className="text-[9px] font-medium text-primary mt-0.5">NOW</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Additional Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex gap-3">
            <span>Entry: {formatPrice(entryPrice)}</span>
            {position.current_price && (
              <span>Now: {formatPrice(position.current_price)}</span>
            )}
          </div>
          <Link to={`/trades/${position.id}`}>
            <Button variant="ghost" size="sm" className="h-6 px-2">
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
