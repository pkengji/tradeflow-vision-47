// src/components/app/TradesFiltersBar.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type TradesFilters = {
  botIds: number[];
  symbols: string[];
  side?: 'all' | 'long' | 'short';
};

type Props = {
  value: TradesFilters;
  onChange: (v: TradesFilters) => void;
  availableBots: { id: number; name: string }[];
  availableSymbols: string[];
};

export default function TradesFiltersBar({ value, onChange, availableBots, availableSymbols }: Props) {
  const [botOpen, setBotOpen] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);

  const toggleBot = (id: number) => {
    const has = value.botIds.includes(id);
    onChange({
      ...value,
      botIds: has ? value.botIds.filter((x) => x !== id) : [...value.botIds, id],
    });
  };

  const toggleSymbol = (sym: string) => {
    const has = value.symbols.includes(sym);
    onChange({
      ...value,
      symbols: has ? value.symbols.filter((x) => x !== sym) : [...value.symbols, sym],
    });
  };

  return (
    <div className="flex flex-wrap gap-2 p-3 rounded bg-card border">
      {/* Bot-Filter */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBotOpen(!botOpen)}
        >
          Bot {value.botIds.length > 0 && `(${value.botIds.length})`}
        </Button>
        {botOpen && (
          <div className="absolute top-full mt-1 z-10 bg-card border rounded shadow-md p-2 space-y-1 min-w-[180px]">
            {availableBots.map((b) => (
              <label key={b.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={value.botIds.includes(b.id)}
                  onChange={() => toggleBot(b.id)}
                />
                <span className="text-sm">{b.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Symbol-Filter */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSymbolOpen(!symbolOpen)}
        >
          Symbol {value.symbols.length > 0 && `(${value.symbols.length})`}
        </Button>
        {symbolOpen && (
          <div className="absolute top-full mt-1 z-10 bg-card border rounded shadow-md p-2 space-y-1 min-w-[140px]">
            {availableSymbols.map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={value.symbols.includes(s)}
                  onChange={() => toggleSymbol(s)}
                />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Side-Filter */}
      <Select value={value.side ?? 'all'} onValueChange={(v) => onChange({ ...value, side: v as any })}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Side" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Clear-Filter */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange({ botIds: [], symbols: [], side: 'all' })}
      >
        Zurücksetzen
      </Button>
    </div>
  );
}
