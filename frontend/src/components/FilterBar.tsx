import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export interface FilterBarValue {
  bots: string[];
  symbols: string[];
  side: 'all' | 'long' | 'short';
  dateRange?: DateRange;
}

interface FilterBarProps {
  bots: string[];
  symbols: string[];
  value: FilterBarValue;
  onChange: (v: FilterBarValue) => void;
}

export function FilterBar({ bots, symbols, value, onChange }: FilterBarProps) {
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => ({
    bots: value.bots.length,
    symbols: value.symbols.length,
  }), [value]);

  const reset = () => onChange({ bots: [], symbols: [], side: 'all', dateRange: undefined });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" /> Filter
            {(counts.bots + counts.symbols > 0 || value.dateRange) && (
              <Badge variant="secondary" className="ml-2">{counts.bots + counts.symbols}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-4" align="start">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium mb-2">Bots</div>
              <div className="grid grid-cols-2 gap-2 max-h-28 overflow-auto pr-1">
                {bots.map(b => (
                  <label key={b} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={value.bots.includes(b)} onCheckedChange={(c)=>{
                      const next = new Set(value.bots);
                      c ? next.add(b) : next.delete(b);
                      onChange({ ...value, bots: Array.from(next) });
                    }} />
                    <span className="truncate">{b}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium mb-2">Symbole</div>
              <div className="grid grid-cols-3 gap-2 max-h-28 overflow-auto pr-1">
                {symbols.map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={value.symbols.includes(s)} onCheckedChange={(c)=>{
                      const next = new Set(value.symbols);
                      c ? next.add(s) : next.delete(s);
                      onChange({ ...value, symbols: Array.from(next) });
                    }} />
                    <span className="truncate">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={value.side==='all'?'default':'outline'} onClick={()=>onChange({...value, side:'all'})}>Alle</Button>
              <Button size="sm" variant={value.side==='long'?'default':'outline'} onClick={()=>onChange({...value, side:'long'})}>Long</Button>
              <Button size="sm" variant={value.side==='short'?'default':'outline'} onClick={()=>onChange({...value, side:'short'})}>Short</Button>
            </div>
            <div>
              <div className="text-xs font-medium mb-2">Zeitraum</div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <Calendar
                  mode="range"
                  selected={value.dateRange}
                  onSelect={(dr)=>onChange({ ...value, dateRange: dr })}
                />
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button size="sm" variant="ghost" onClick={reset}><X className="h-4 w-4 mr-1" />Zurücksetzen</Button>
              <Button size="sm" onClick={()=>setOpen(false)}>Fertig</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Quick badges */}
      {value.bots.slice(0,3).map(b => <Badge key={b} variant="secondary">{b}</Badge>)}
      {value.symbols.slice(0,3).map(s => <Badge key={s} variant="outline">{s}</Badge>)}
      {value.dateRange && (
        <Badge variant="outline">
          {value.dateRange.from ? format(value.dateRange.from, 'dd.MM.yyyy') : '—'} – {value.dateRange.to ? format(value.dateRange.to, 'dd.MM.yyyy') : '—'}
        </Badge>
      )}
    </div>
  );
}
