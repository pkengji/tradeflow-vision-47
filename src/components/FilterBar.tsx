import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Filter, X, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

interface FilterBarProps {
  bots: string[];
  pairs: string[];
  selectedBots: string[];
  selectedPairs: string[];
  dateRange?: DateRange;
  side: 'all' | 'long' | 'short';
  onBotsChange: (bots: string[]) => void;
  onPairsChange: (pairs: string[]) => void;
  onDateRangeChange: (range?: DateRange) => void;
  onSideChange: (side: 'all' | 'long' | 'short') => void;
  onReset: () => void;
}

export function FilterBar({
  bots,
  pairs,
  selectedBots,
  selectedPairs,
  dateRange,
  side,
  onBotsChange,
  onPairsChange,
  onDateRangeChange,
  onSideChange,
  onReset,
}: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount = 
    selectedBots.length + 
    selectedPairs.length + 
    (dateRange?.from ? 1 : 0) + 
    (side !== 'all' ? 1 : 0);

  const toggleBot = (bot: string) => {
    if (selectedBots.includes(bot)) {
      onBotsChange(selectedBots.filter(b => b !== bot));
    } else {
      onBotsChange([...selectedBots, bot]);
    }
  };

  const togglePair = (pair: string) => {
    if (selectedPairs.includes(pair)) {
      onPairsChange(selectedPairs.filter(p => p !== pair));
    } else {
      onPairsChange([...selectedPairs, pair]);
    }
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border pb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-4 w-4 mr-2" />
              Filter
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              {/* Bots */}
              <div>
                <h4 className="font-medium mb-2 text-sm">Bots</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {bots.map((bot) => (
                    <div key={bot} className="flex items-center space-x-2">
                      <Checkbox
                        id={`bot-${bot}`}
                        checked={selectedBots.includes(bot)}
                        onCheckedChange={() => toggleBot(bot)}
                      />
                      <label
                        htmlFor={`bot-${bot}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {bot}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pairs */}
              <div>
                <h4 className="font-medium mb-2 text-sm">Pairs</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {pairs.map((pair) => (
                    <div key={pair} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pair-${pair}`}
                        checked={selectedPairs.includes(pair)}
                        onCheckedChange={() => togglePair(pair)}
                      />
                      <label
                        htmlFor={`pair-${pair}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {pair}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Side */}
              <div>
                <h4 className="font-medium mb-2 text-sm">Direction</h4>
                <div className="flex gap-2">
                  <Button
                    variant={side === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onSideChange('all')}
                    className="flex-1"
                  >
                    All
                  </Button>
                  <Button
                    variant={side === 'long' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onSideChange('long')}
                    className="flex-1"
                  >
                    Long
                  </Button>
                  <Button
                    variant={side === 'short' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onSideChange('short')}
                    className="flex-1"
                  >
                    Short
                  </Button>
                </div>
              </div>

              {/* Date Range */}
              <div>
                <h4 className="font-medium mb-2 text-sm">Date Range</h4>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, 'dd.MM.yyyy')} - {format(dateRange.to, 'dd.MM.yyyy')}
                          </>
                        ) : (
                          format(dateRange.from, 'dd.MM.yyyy')
                        )
                      ) : (
                        'Select date range'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={onDateRangeChange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-8">
            <X className="h-4 w-4 mr-2" />
            Reset
          </Button>
        )}

        {/* Active Filter Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedBots.map((bot) => (
            <Badge key={bot} variant="secondary" className="gap-1">
              {bot}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleBot(bot)}
              />
            </Badge>
          ))}
          {selectedPairs.map((pair) => (
            <Badge key={pair} variant="secondary" className="gap-1">
              {pair}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => togglePair(pair)}
              />
            </Badge>
          ))}
          {side !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {side}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onSideChange('all')}
              />
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
