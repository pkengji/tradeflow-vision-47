import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";

type Props = {
  symbol: string;
  baseIconUrl?: string;
  botName?: string;
  side: "long"|"short";
  pnl: number; // positive/negative
  deltaPct?: number; // movement from entry to now/close
  onClick?: ()=>void;
};

export default function TradeCardCompact({ symbol, baseIconUrl, botName, side, pnl, deltaPct, onClick }: Props){
  const isLong = side === "long";
  const color = pnl >= 0 ? "text-[hsl(var(--long))]" : "text-[hsl(var(--short))]";
  return (
    <div className="flex items-center gap-2 p-2.5 border rounded hover:bg-muted cursor-pointer shadow-sm" onClick={onClick}>
      <div className="w-7 h-7 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
        {baseIconUrl ? <img src={baseIconUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-medium">{symbol.slice(0,3)}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="font-medium truncate text-sm">{symbol}</div>
          <Badge 
            variant={isLong ? "default" : "destructive"}
            className={`${isLong ? 'bg-[hsl(var(--long))] hover:bg-[hsl(var(--long))]/80 text-[hsl(var(--long-foreground))]' : 'bg-[hsl(var(--short))] hover:bg-[hsl(var(--short))]/80 text-[hsl(var(--short-foreground))]'} text-[10px] px-1.5 py-0 h-4`}
          >
            {side.toUpperCase()}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">{botName ?? "—"}</div>
      </div>
      <div className="text-right">
        <div className={`font-semibold text-sm ${color}`}>{formatCurrency(pnl, true)}</div>
        {typeof deltaPct === "number" && <div className={`text-xs ${color}`}>({(deltaPct*100).toFixed(2)}%)</div>}
      </div>
    </div>
  );
}
