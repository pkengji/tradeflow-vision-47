// src/components/app/TradesFiltersBar.tsx
import { useMemo, useState } from 'react';
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
  // neue Filter
  dateFrom?: string;        // ISO yyyy-mm-dd
  dateTo?: string;          // ISO yyyy-mm-dd
  timeOpen?: [number, number];   // Stunden 0..23
  timeClose?: [number, number];  // Stunden 0..23
};

type Bot = { id: number; name: string };

export default function TradesFiltersBar({
  availableBots,
  availableSymbols,
  value,
  onChange,
  activeTab, // 'open' | 'closed' – bei 'open' blenden wir Date/Time-Filter aus
}: {
  availableBots: Bot[];
  availableSymbols: string[];
  value: TradesFilters;
  onChange: (next: TradesFilters) => void;
  activeTab: 'open' | 'closed';
}) {
  const [botOpen, setBotOpen] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, h) => ({ v: h, label: `${String(h).padStart(2, '0')}:00` })),
    []
  );

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

  const setRange = (key: 'timeOpen' | 'timeClose', idx: 0 | 1, hour: number) => {
    const cur = (value[key] ?? [0, 23]) as [number, number];
    const next: [number, number] = idx === 0 ? [hour, cur[1]] : [cur[0], hour];
    onChange({ ...value, [key]: next });
  };

  const clearAll = () =>
    onChange({
      botIds: [],
      symbols: [],
      side: 'all',
      dateFrom: undefined,
      dateTo: undefined,
      timeOpen: undefined,
      timeClose: undefined,
    });

  return (
    <div className="flex flex-wrap gap-2 p-3 rounded bg-card border">
      {/* Bot-Filter */}
      <div className="relative">
        <Button variant="outline" size="sm" onClick={() => setBotOpen(!botOpen)}>
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
        <Button variant="outline" size="sm" onClick={() => setSymbolOpen(!symbolOpen)}>
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

      {/* Date/Time – nur wenn Tab "closed" aktiv ist */}
      {activeTab === 'closed' && (
        <>
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="border rounded px-2 py-1 text-sm"
              value={value.dateFrom ?? ''}
              onChange={(e) => onChange({ ...value, dateFrom: e.target.value || undefined })}
            />
            <span className="text-xs text-muted-foreground">bis</span>
            <input
              type="date"
              className="border rounded px-2 py-1 text-sm"
              value={value.dateTo ?? ''}
              onChange={(e) => onChange({ ...value, dateTo: e.target.value || undefined })}
            />
          </div>

          {/* Time Range (Opened) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Opened</span>
            <Select
              value={String((value.timeOpen ?? [0, 23])[0])}
              onValueChange={(v) => setRange('timeOpen', 0, Number(v))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map(({ v, label }) => (
                  <SelectItem key={`open-start-${v}`} value={String(v)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">–</span>
            <Select
              value={String((value.timeOpen ?? [0, 23])[1])}
              onValueChange={(v) => setRange('timeOpen', 1, Number(v))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map(({ v, label }) => (
                  <SelectItem key={`open-end-${v}`} value={String(v)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Range (Closed) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Closed</span>
            <Select
              value={String((value.timeClose ?? [0, 23])[0])}
              onValueChange={(v) => setRange('timeClose', 0, Number(v))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map(({ v, label }) => (
                  <SelectItem key={`close-start-${v}`} value={String(v)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">–</span>
            <Select
              value={String((value.timeClose ?? [0, 23])[1])}
              onValueChange={(v) => setRange('timeClose', 1, Number(v))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map(({ v, label }) => (
                  <SelectItem key={`close-end-${v}`} value={String(v)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Clear */}
      <Button variant="ghost" size="sm" onClick={clearAll}>
        Zurücksetzen
      </Button>
    </div>
  );
}
