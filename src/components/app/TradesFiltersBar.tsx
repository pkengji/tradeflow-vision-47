import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, X, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';

export type TradesFilters = {
  botIds: number[];
  symbols: string[];
  side?: 'all' | 'long' | 'short';
  dateFrom?: Date;
  dateTo?: Date;
  timeFrom?: string; // HH:MM
  timeTo?: string; // HH:MM
  timeMode?: 'opened' | 'closed'; // für Tageszeitfilter
  signalKind?: 'all' | 'automatic' | 'manual'; // nur für Signals
  signalStatus?: 'all' | 'completed' | 'failed' | 'rejected' | 'pending' | 'waiting_for_approval'; // nur für Signals
};

type Props = {
  // For Dashboard usage with direct props
  selectedBots?: number[];
  onBotsChange?: (bots: number[]) => void;
  selectedSymbols?: string[];
  onSymbolsChange?: (symbols: string[]) => void;
  dateFrom?: Date;
  dateTo?: Date;
  onDateFromChange?: (date: Date | undefined) => void;
  onDateToChange?: (date: Date | undefined) => void;
  direction?: string;
  onDirectionChange?: (direction: string) => void;
  openHourFrom?: string;
  openHourTo?: string;
  onOpenHourFromChange?: (value: string) => void;
  onOpenHourToChange?: (value: string) => void;
  closeHourFrom?: string;
  closeHourTo?: string;
  onCloseHourFromChange?: (value: string) => void;
  onCloseHourToChange?: (value: string) => void;
  onResetFilters?: () => void;
  txCostsMode?: 'percent' | 'usdt';
  onTxCostsModeChange?: (mode: 'percent' | 'usdt') => void;
  
  // For Trades/Signals page usage with TradesFilters object
  value?: TradesFilters;
  onChange?: (v: TradesFilters) => void;
  availableBots: { id: number; name: string }[];
  availableSymbols: string[];
  // Welche Filter anzeigen?
  showDateRange?: boolean;
  showTimeRange?: boolean;
  showSignalKind?: boolean;
  showSignalStatus?: boolean;
  compact?: boolean;
};

export default function TradesFiltersBar({
  // Dashboard props
  selectedBots,
  onBotsChange,
  selectedSymbols,
  onSymbolsChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  direction,
  onDirectionChange,
  openHourFrom,
  openHourTo,
  onOpenHourFromChange,
  onOpenHourToChange,
  closeHourFrom,
  closeHourTo,
  onCloseHourFromChange,
  onCloseHourToChange,
  onResetFilters,
  txCostsMode,
  onTxCostsModeChange,
  
  // Trades/Signals props
  value,
  onChange,
  availableBots,
  availableSymbols,
  showDateRange = true,
  showTimeRange = true,
  showSignalKind = false,
  showSignalStatus = false,
  compact = false,
}: Props) {
  const [showFilters] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [botSearch, setBotSearch] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');

  // Use Dashboard props or Trades/Signals props
  const isDashboardMode = selectedBots !== undefined;
  const currentBots = isDashboardMode ? selectedBots : value?.botIds || [];
  const currentSymbols = isDashboardMode ? selectedSymbols : value?.symbols || [];
  const currentDateFrom = isDashboardMode ? dateFrom : value?.dateFrom;
  const currentDateTo = isDashboardMode ? dateTo : value?.dateTo;

  const filteredBots = useMemo(() => {
    if (!botSearch) return availableBots;
    const q = botSearch.toLowerCase();
    return availableBots.filter((b) => b.name.toLowerCase().includes(q));
  }, [availableBots, botSearch]);

  const filteredSymbols = useMemo(() => {
    if (!symbolSearch) return availableSymbols;
    const q = symbolSearch.toLowerCase();
    return availableSymbols.filter((s) => s.toLowerCase().includes(q));
  }, [availableSymbols, symbolSearch]);

  const toggleBot = (id: number) => {
    if (isDashboardMode && onBotsChange) {
      const has = currentBots.includes(id);
      onBotsChange(has ? currentBots.filter((x) => x !== id) : [...currentBots, id]);
    } else if (onChange && value) {
      const has = value.botIds.includes(id);
      onChange({ ...value, botIds: has ? value.botIds.filter((x) => x !== id) : [...value.botIds, id] });
    }
  };

  const toggleSymbol = (sym: string) => {
    if (isDashboardMode && onSymbolsChange) {
      const has = currentSymbols.includes(sym);
      onSymbolsChange(has ? currentSymbols.filter((x) => x !== sym) : [...currentSymbols, sym]);
    } else if (onChange && value) {
      const has = value.symbols.includes(sym);
      onChange({ ...value, symbols: has ? value.symbols.filter((x) => x !== sym) : [...value.symbols, sym] });
    }
  };

  const resetFilters = () => {
    if (onResetFilters) {
      onResetFilters();
    } else if (onChange) {
      onChange({
        botIds: [],
        symbols: [],
        side: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        timeFrom: undefined,
        timeTo: undefined,
        timeMode: 'opened',
        signalKind: 'all',
        signalStatus: 'all',
      });
    }
  };

  const closeAllDropdowns = () => setOpenDropdown(null);

  const toggleDropdown = (name: string) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  const activeFilterCount = useMemo(() => {
    if (isDashboardMode) {
      let count = 0;
      if (currentBots.length > 0) count++;
      if (currentSymbols.length > 0) count++;
      if (direction && direction !== 'both') count++;
      if (dateFrom || dateTo) count++;
      if (openHourFrom || closeHourFrom) count++;
      return count;
    } else {
      let count = 0;
      if (value?.botIds.length) count++;
      if (value?.symbols.length) count++;
      if (value?.side && value.side !== 'all') count++;
      if (value?.dateFrom || value?.dateTo) count++;
      if (value?.timeFrom || value?.timeTo) count++;
      if (value?.signalKind && value.signalKind !== 'all') count++;
      if (value?.signalStatus && value.signalStatus !== 'all') count++;
      return count;
    }
  }, [isDashboardMode, currentBots, currentSymbols, direction, dateFrom, dateTo, openHourFrom, closeHourFrom, value]);

  return (
    <div className={compact ? "space-y-3" : "w-full p-4 space-y-3"}>
      {showFilters && (
        <div className={compact ? "space-y-3" : "bg-card border rounded-lg shadow-lg p-4 space-y-3"}>
          {!compact && (
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-medium">Filter</span>
            </div>
          )}

          {/* Bot-Filter */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => toggleDropdown('bot')}
            >
              Bot {value.botIds.length > 0 && `(${value.botIds.length})`}
            </Button>
            {openDropdown === 'bot' && (
              <div className="absolute top-full mt-1 z-10 bg-card border rounded shadow-md p-2 space-y-2 min-w-[250px] max-h-64 overflow-auto">
                <Input
                  placeholder="Bot suchen..."
                  value={botSearch}
                  onChange={(e) => setBotSearch(e.target.value)}
                  className="text-sm"
                />
                {filteredBots.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={value.botIds.includes(b.id)} onChange={() => toggleBot(b.id)} />
                    <span className="text-sm">{b.name}</span>
                  </label>
                ))}
                {filteredBots.length === 0 && <div className="text-sm text-muted-foreground px-2">Keine Bots gefunden</div>}
              </div>
            )}
          </div>

          {/* Symbol-Filter */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => toggleDropdown('symbol')}
            >
              Symbol {value.symbols.length > 0 && `(${value.symbols.length})`}
            </Button>
            {openDropdown === 'symbol' && (
              <div className="absolute top-full mt-1 z-10 bg-card border rounded shadow-md p-2 space-y-2 min-w-[250px] max-h-64 overflow-auto">
                <Input
                  placeholder="Symbol suchen..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="text-sm"
                />
                {filteredSymbols.map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={value.symbols.includes(s)} onChange={() => toggleSymbol(s)} />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
                {filteredSymbols.length === 0 && <div className="text-sm text-muted-foreground px-2">Keine Symbole gefunden</div>}
              </div>
            )}
          </div>

          {/* Richtung */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={value.side === 'all' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => onChange({ ...value, side: 'all' })}
            >
              Alle
            </Button>
            <Button
              size="sm"
              variant={value.side === 'long' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => onChange({ ...value, side: 'long' })}
            >
              Long
            </Button>
            <Button
              size="sm"
              variant={value.side === 'short' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => onChange({ ...value, side: 'short' })}
            >
              Short
            </Button>
          </div>

          {/* Transaktionskosten Toggle (nur für Dashboard) */}
          {txCostsMode !== undefined && onTxCostsModeChange && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Transaktionskosten</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={txCostsMode === 'percent' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onTxCostsModeChange('percent')}
                >
                  In %
                </Button>
                <Button
                  size="sm"
                  variant={txCostsMode === 'usdt' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onTxCostsModeChange('usdt')}
                >
                  In USDT
                </Button>
              </div>
            </div>
          )}

          {/* Datumsbereich */}
          {showDateRange && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Datumsbereich</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {value.dateFrom || value.dateTo
                      ? `${value.dateFrom ? format(value.dateFrom, 'dd.MM.yyyy') : '...'} - ${value.dateTo ? format(value.dateTo, 'dd.MM.yyyy') : '...'}`
                      : 'Datum wählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
                  <div className="p-3 space-y-2">
                    <div className="text-xs font-medium">Von</div>
                    <Calendar
                      mode="single"
                      selected={value.dateFrom}
                      onSelect={(date) => onChange({ ...value, dateFrom: date })}
                      className="pointer-events-auto"
                    />
                    <div className="text-xs font-medium mt-2">Bis</div>
                    <Calendar
                      mode="single"
                      selected={value.dateTo}
                      onSelect={(date) => onChange({ ...value, dateTo: date })}
                      className="pointer-events-auto"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Tageszeitfilter */}
          {showTimeRange && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Tageszeit</div>
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={value.timeFrom || ''}
                  onChange={(e) => onChange({ ...value, timeFrom: e.target.value })}
                  className="text-sm"
                  placeholder="Von"
                />
                <Input
                  type="time"
                  value={value.timeTo || ''}
                  onChange={(e) => onChange({ ...value, timeTo: e.target.value })}
                  className="text-sm"
                  placeholder="Bis"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant={value.timeMode === 'opened' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onChange({ ...value, timeMode: 'opened' })}
                >
                  Geöffnet
                </Button>
                <Button
                  size="sm"
                  variant={value.timeMode === 'closed' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onChange({ ...value, timeMode: 'closed' })}
                >
                  Geschlossen
                </Button>
              </div>
            </div>
          )}

          {/* Signal-Art (nur für Signals-Seite) */}
          {showSignalKind && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Signal-Art</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={value.signalKind === 'all' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onChange({ ...value, signalKind: 'all' })}
                >
                  Alle
                </Button>
                <Button
                  size="sm"
                  variant={value.signalKind === 'automatic' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onChange({ ...value, signalKind: 'automatic' })}
                >
                  Automatisch
                </Button>
                <Button
                  size="sm"
                  variant={value.signalKind === 'manual' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onChange({ ...value, signalKind: 'manual' })}
                >
                  Manuell
                </Button>
              </div>
            </div>
          )}

          {/* Signal-Status (nur für Signals-Seite) */}
          {showSignalStatus && (
            <div className="space-y-2 relative">
              <div className="text-xs font-medium">Status</div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between"
                onClick={() => toggleDropdown('signalStatus')}
              >
                {value.signalStatus === 'all' ? 'Alle Status' : 
                 value.signalStatus === 'completed' ? 'Completed' :
                 value.signalStatus === 'failed' ? 'Failed' :
                 value.signalStatus === 'rejected' ? 'Rejected' :
                 value.signalStatus === 'pending' ? 'Pending' :
                 value.signalStatus === 'waiting_for_approval' ? 'Waiting for approval' : 'Alle Status'}
              </Button>
              {openDropdown === 'signalStatus' && (
                <div className="absolute top-full mt-1 z-10 bg-card border rounded shadow-md p-2 space-y-1 min-w-[200px]">
                  {['all', 'completed', 'failed', 'rejected', 'pending', 'waiting_for_approval'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        onChange({ ...value, signalStatus: status as any });
                        closeAllDropdowns();
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-muted ${
                        value.signalStatus === status ? 'bg-primary text-primary-foreground' : ''
                      }`}
                    >
                      {status === 'all' ? 'Alle Status' :
                       status === 'completed' ? 'Completed' :
                       status === 'failed' ? 'Failed' :
                       status === 'rejected' ? 'Rejected' :
                       status === 'pending' ? 'Pending' :
                       'Waiting for approval'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aktionen */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-1" />
              Zurücksetzen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
