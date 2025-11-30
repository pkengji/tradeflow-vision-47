import { useState, useMemo, useEffect } from 'react';
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
  timeFrom?: string;
  timeTo?: string;
  onTimeFromChange?: (value: string) => void;
  onTimeToChange?: (value: string) => void;
  timeMode?: "opened" | "closed";
  onTimeModeChange?: (mode: "opened" | "closed") => void;
  onResetFilters?: () => void;
  showCostAsPercent?: boolean;
  onShowCostAsPercentChange?: (value: boolean) => void;
  
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
  
  // Callback to close filter view (for mobile/tablet)
  onClose?: () => void;
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
  timeFrom,
  timeTo,
  onTimeFromChange,
  onTimeToChange,
  timeMode,
  onTimeModeChange,
  onResetFilters,
  showCostAsPercent,
  onShowCostAsPercentChange,
  
  // Trades/Signals props
  value,
  onChange,
  availableBots,
  availableSymbols,
  showDateRange = true,
  showTimeRange = true,
  showSignalKind = false,
  showSignalStatus = false,
  
  // Close callback
  onClose,
}: Props) {
  const [showFilters] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [botSearch, setBotSearch] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');

  // Use Dashboard props or Trades/Signals props
  const isDashboardMode = onBotsChange !== undefined;
  
  // Local intermediate states for filters
  const [localBots, setLocalBots] = useState<number[]>([]);
  const [localSymbols, setLocalSymbols] = useState<string[]>([]);
  const [localDirection, setLocalDirection] = useState<string>('both');
  const [localSide, setLocalSide] = useState<'all' | 'long' | 'short'>('all');
  const [localDateFrom, setLocalDateFrom] = useState<Date | undefined>();
  const [localDateTo, setLocalDateTo] = useState<Date | undefined>();
  const [localTimeFrom, setLocalTimeFrom] = useState<string>('');
  const [localTimeTo, setLocalTimeTo] = useState<string>('');
  const [localTimeMode, setLocalTimeMode] = useState<'opened' | 'closed'>('opened');
  const [localShowCostAsPercent, setLocalShowCostAsPercent] = useState(false);
  const [localSignalKind, setLocalSignalKind] = useState<'all' | 'automatic' | 'manual'>('all');
  const [localSignalStatus, setLocalSignalStatus] = useState<'all' | 'completed' | 'failed' | 'rejected' | 'pending' | 'waiting_for_approval'>('all');

  // Initialize local states from props
  useEffect(() => {
    if (isDashboardMode) {
      setLocalBots(selectedBots || []);
      setLocalSymbols(selectedSymbols || []);
      setLocalDirection(direction || 'both');
      setLocalDateFrom(dateFrom);
      setLocalDateTo(dateTo);
      setLocalTimeFrom(timeFrom || '');
      setLocalTimeTo(timeTo || '');
      setLocalTimeMode(timeMode || 'opened');
      setLocalShowCostAsPercent(showCostAsPercent || false);
    } else if (value) {
      setLocalBots(value.botIds || []);
      setLocalSymbols(value.symbols || []);
      setLocalSide(value.side || 'all');
      setLocalDateFrom(value.dateFrom);
      setLocalDateTo(value.dateTo);
      setLocalTimeFrom(value.timeFrom || '');
      setLocalTimeTo(value.timeTo || '');
      setLocalTimeMode(value.timeMode || 'opened');
      setLocalSignalKind(value.signalKind || 'all');
      setLocalSignalStatus(value.signalStatus || 'all');
    }
  }, [isDashboardMode, selectedBots, selectedSymbols, direction, dateFrom, dateTo, timeFrom, timeTo, timeMode, showCostAsPercent, value]);

  const currentBots = localBots;
  const currentSymbols = localSymbols;
  const currentDateFrom = localDateFrom;
  const currentDateTo = localDateTo;

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
    const has = currentBots.includes(id);
    setLocalBots(has ? currentBots.filter((x) => x !== id) : [...currentBots, id]);
  };

  const toggleSymbol = (sym: string) => {
    const has = currentSymbols.includes(sym);
    setLocalSymbols(has ? currentSymbols.filter((x) => x !== sym) : [...currentSymbols, sym]);
  };

  const applyFilters = () => {
    if (isDashboardMode) {
      onBotsChange?.(localBots);
      onSymbolsChange?.(localSymbols);
      onDirectionChange?.(localDirection);
      onDateFromChange?.(localDateFrom);
      onDateToChange?.(localDateTo);
      onTimeFromChange?.(localTimeFrom);
      onTimeToChange?.(localTimeTo);
      onTimeModeChange?.(localTimeMode);
      onShowCostAsPercentChange?.(localShowCostAsPercent);
    } else if (onChange) {
      onChange({
        botIds: localBots,
        symbols: localSymbols,
        side: localSide,
        dateFrom: localDateFrom,
        dateTo: localDateTo,
        timeFrom: localTimeFrom,
        timeTo: localTimeTo,
        timeMode: localTimeMode,
        signalKind: localSignalKind,
        signalStatus: localSignalStatus,
      });
    }
    
    // Close filter view on mobile/tablet
    onClose?.();
  };

  const resetFilters = () => {
    setLocalBots([]);
    setLocalSymbols([]);
    setLocalDirection('both');
    setLocalSide('all');
    setLocalDateFrom(undefined);
    setLocalDateTo(undefined);
    setLocalTimeFrom('');
    setLocalTimeTo('');
    setLocalTimeMode('opened');
    setLocalShowCostAsPercent(false);
    setLocalSignalKind('all');
    setLocalSignalStatus('all');
    
    if (isDashboardMode && onResetFilters) {
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
    
    // Close filter view on mobile/tablet
    onClose?.();
  };

  const closeAllDropdowns = () => setOpenDropdown(null);

  const toggleDropdown = (name: string) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (currentBots.length > 0) count++;
    if (currentSymbols.length > 0) count++;
    if (isDashboardMode) {
      if (localDirection && localDirection !== 'both') count++;
      if (localTimeFrom || localTimeTo) count++;
    } else {
      if (localSide && localSide !== 'all') count++;
      if (localTimeFrom || localTimeTo) count++;
      if (localSignalKind && localSignalKind !== 'all') count++;
      if (localSignalStatus && localSignalStatus !== 'all') count++;
    }
    if (currentDateFrom || currentDateTo) count++;
    return count;
  }, [currentBots, currentSymbols, isDashboardMode, localDirection, localSide, currentDateFrom, currentDateTo, localTimeFrom, localTimeTo, localSignalKind, localSignalStatus]);

  return (
    <div className="w-full">
      <div className="p-4">
        <div className="bg-card border rounded-lg shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-medium">Filter</span>
          </div>

          {/* Bot-Filter */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => toggleDropdown('bot')}
            >
              Bot {currentBots.length > 0 && `(${currentBots.length})`}
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
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded">
                    <input type="checkbox" checked={currentBots.includes(b.id)} onChange={() => toggleBot(b.id)} />
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
              Symbol {currentSymbols.length > 0 && `(${currentSymbols.length})`}
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
                  <label key={s} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded">
                    <input type="checkbox" checked={currentSymbols.includes(s)} onChange={() => toggleSymbol(s)} />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
                {filteredSymbols.length === 0 && <div className="text-sm text-muted-foreground px-2">Keine Symbole gefunden</div>}
              </div>
            )}
          </div>

          {/* Richtung */}
          <div className="flex gap-2">
            {isDashboardMode ? (
              <>
                <Button
                  size="sm"
                  variant={localDirection === 'both' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalDirection('both')}
                >
                  Alle
                </Button>
                <Button
                  size="sm"
                  variant={localDirection === 'long' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalDirection('long')}
                >
                  Long
                </Button>
                <Button
                  size="sm"
                  variant={localDirection === 'short' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalDirection('short')}
                >
                  Short
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={localSide === 'all' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalSide('all')}
                >
                  Alle
                </Button>
                <Button
                  size="sm"
                  variant={localSide === 'long' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalSide('long')}
                >
                  Long
                </Button>
                <Button
                  size="sm"
                  variant={localSide === 'short' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalSide('short')}
                >
                  Short
                </Button>
              </>
            )}
          </div>

          {/* Datumsbereich */}
          {showDateRange && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Datumsbereich</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {currentDateFrom || currentDateTo
                      ? `${currentDateFrom ? format(currentDateFrom, 'dd.MM.yyyy') : '...'} - ${currentDateTo ? format(currentDateTo, 'dd.MM.yyyy') : '...'}`
                      : 'Datum wählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 space-y-2">
                    <div className="text-xs font-medium">Von</div>
                    <Calendar
                      mode="single"
                      selected={currentDateFrom}
                      onSelect={(date) => setLocalDateFrom(date)}
                      className="pointer-events-auto"
                    />
                    <div className="text-xs font-medium mt-2">Bis</div>
                    <Calendar
                      mode="single"
                      selected={currentDateTo}
                      onSelect={(date) => setLocalDateTo(date)}
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
                  value={localTimeFrom}
                  onChange={(e) => setLocalTimeFrom(e.target.value)}
                  className="text-sm"
                  placeholder="Von"
                />
                <Input
                  type="time"
                  value={localTimeTo}
                  onChange={(e) => setLocalTimeTo(e.target.value)}
                  className="text-sm"
                  placeholder="Bis"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant={localTimeMode === 'opened' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalTimeMode('opened')}
                >
                  Geöffnet
                </Button>
                <Button
                  size="sm"
                  variant={localTimeMode === 'closed' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalTimeMode('closed')}
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
                  variant={localSignalKind === 'all' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalSignalKind('all')}
                >
                  Alle
                </Button>
                <Button
                  size="sm"
                  variant={localSignalKind === 'automatic' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalSignalKind('automatic')}
                >
                  Automatisch
                </Button>
                <Button
                  size="sm"
                  variant={localSignalKind === 'manual' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setLocalSignalKind('manual')}
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
                {localSignalStatus === 'all' ? 'Alle Status' : 
                 localSignalStatus === 'completed' ? 'Completed' :
                 localSignalStatus === 'failed' ? 'Failed' :
                 localSignalStatus === 'rejected' ? 'Rejected' :
                 localSignalStatus === 'pending' ? 'Pending' :
                 localSignalStatus === 'waiting_for_approval' ? 'Waiting for approval' : 'Alle Status'}
              </Button>
              {openDropdown === 'signalStatus' && (
                <div className="absolute top-full mt-1 z-10 bg-card border rounded shadow-md p-2 space-y-1 min-w-[200px]">
                  {['all', 'completed', 'failed', 'rejected', 'pending', 'waiting_for_approval'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setLocalSignalStatus(status as any);
                        closeAllDropdowns();
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-muted ${
                        localSignalStatus === status ? 'bg-primary text-primary-foreground' : ''
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

          {/* Toggle für Kosten-Anzeige (nur Dashboard) */}
          {isDashboardMode && onShowCostAsPercentChange && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs font-medium">Kostenanzeige</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={!localShowCostAsPercent ? 'default' : 'outline'}
                  onClick={() => setLocalShowCostAsPercent(false)}
                >
                  $
                </Button>
                <Button
                  size="sm"
                  variant={localShowCostAsPercent ? 'default' : 'outline'}
                  onClick={() => setLocalShowCostAsPercent(true)}
                >
                  %
                </Button>
              </div>
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
            <Button
              variant="default"
              size="sm"
              onClick={applyFilters}
              className="flex-1"
            >
              Fertig
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
