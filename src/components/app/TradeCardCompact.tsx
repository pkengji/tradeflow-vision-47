
import React from "react";

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
  const color = pnl >= 0 ? "text-green-600" : "text-red-600";
  return (
    <div className="flex items-center gap-3 p-3 border rounded hover:bg-muted cursor-pointer" onClick={onClick}>
      <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
        {baseIconUrl ? <img src={baseIconUrl} alt="" /> : <span className="text-xs">{symbol.slice(0,3)}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium truncate">{symbol}</div>
          <div className={`text-xs uppercase ${side==="long"?"text-green-700":"text-red-700"}`}>{side}</div>
        </div>
        <div className="text-xs text-muted-foreground truncate">{botName ?? "—"}</div>
      </div>
      <div className="text-right">
        <div className={`font-semibold ${color}`}>{pnl.toFixed(2)} USDT</div>
        {typeof deltaPct === "number" && <div className={`text-xs ${color}`}>({(deltaPct*100).toFixed(2)}%)</div>}
      </div>
    </div>
  );
}
