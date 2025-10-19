import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type TradesFilters = {
  botIds: number[];
  symbols: string[];
  side?: 'long' | 'short' | 'all';
  status?: 'open' | 'closed' | 'all';
};

type Props = {
  value: TradesFilters;
  onChange: (f: TradesFilters) => void;
  availableBots?: Array<{ id: number; name: string }>;
  availableSymbols?: string[];
};

export default function TradesFiltersBar({ 
  value, 
  onChange, 
  availableBots = [], 
  availableSymbols = [] 
}: Props) {
  const [local, setLocal] = useState<TradesFilters>(value);
  
  useEffect(() => setLocal(value), [value]);

  const apply = () => onChange(local);
  const reset = () => {
    const empty: TradesFilters = { botIds: [], symbols: [], side: 'all', status: 'all' };
    setLocal(empty);
    onChange(empty);
  };

  const toggleBot = (botId: number) => {
    const exists = local.botIds.includes(botId);
    setLocal({
      ...local,
      botIds: exists 
        ? local.botIds.filter(id => id !== botId)
        : [...local.botIds, botId]
    });
  };

  const toggleSymbol = (symbol: string) => {
    const exists = local.symbols.includes(symbol);
    setLocal({
      ...local,
      symbols: exists
        ? local.symbols.filter(s => s !== symbol)
        : [...local.symbols, symbol]
    });
  };

  return (
    <div className="bg-card rounded-lg border p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bots Multi-Select */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Bots</label>
          <Select onValueChange={(val) => toggleBot(Number(val))}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={
                local.botIds.length > 0 
                  ? `${local.botIds.length} ausgewählt` 
                  : "Alle Bots"
              } />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {availableBots.map((bot) => (
                <SelectItem key={bot.id} value={String(bot.id)}>
                  {bot.name} {local.botIds.includes(bot.id) && "✓"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {local.botIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {local.botIds.map(id => {
                const bot = availableBots.find(b => b.id === id);
                return (
                  <Button
                    key={id}
                    variant="secondary"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => toggleBot(id)}
                  >
                    {bot?.name || `Bot ${id}`}
                    <X className="ml-1 h-3 w-3" />
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Symbols Multi-Select */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Coins</label>
          <Select onValueChange={toggleSymbol}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={
                local.symbols.length > 0
                  ? `${local.symbols.length} ausgewählt`
                  : "Alle Coins"
              } />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {availableSymbols.map((symbol) => (
                <SelectItem key={symbol} value={symbol}>
                  {symbol} {local.symbols.includes(symbol) && "✓"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {local.symbols.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {local.symbols.map(symbol => (
                <Button
                  key={symbol}
                  variant="secondary"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => toggleSymbol(symbol)}
                >
                  {symbol}
                  <X className="ml-1 h-3 w-3" />
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Side Filter */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Side</label>
          <Select 
            value={local.side ?? 'all'} 
            onValueChange={(val) => setLocal({ ...local, side: val as any })}
          >
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select 
            value={local.status ?? 'all'} 
            onValueChange={(val) => setLocal({ ...local, status: val as any })}
          >
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={reset}>
          Reset
        </Button>
        <Button size="sm" onClick={apply}>
          Übernehmen
        </Button>
      </div>
    </div>
  );
}
