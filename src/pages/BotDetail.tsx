import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, Save, Copy, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';

type BotPair = {
  symbol: string;
  leverage: number | 'max';
  tvMultiplier: number;
  directions: { long: boolean; short: boolean };
};

export default function BotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const botId = isNew ? null : Number(id);
  const qc = useQueryClient();

  const { data: bot, isLoading } = useQuery({
    queryKey: ['bot', botId],
    queryFn: async () => {
      if (isNew) return null;
      const all = await api.getBots();
      return all.find((b: Bot) => b.id === botId);
    },
    enabled: !isNaN(botId!) || isNew,
  });

  const [name, setName] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [pairs, setPairs] = useState<BotPair[]>([]);
  const [globalLeverage, setGlobalLeverage] = useState<number | 'max' | ''>('');
  const [globalMultiplier, setGlobalMultiplier] = useState<number | ''>('');
  const [marginType, setMarginType] = useState<'isolated' | 'cross' | 'auto'>('isolated');
  const [marginUnit, setMarginUnit] = useState<'percent_bot' | 'percent_trade' | 'usdt_bot' | 'usdt_trade'>('percent_bot');
  const [marginValue, setMarginValue] = useState<number | ''>('');
  const [searchPair, setSearchPair] = useState('');
  const [sortBy, setSortBy] = useState<'symbol' | 'leverage' | 'multiplier'>('symbol');
  const [addPairDialogOpen, setAddPairDialogOpen] = useState(false);
  const [selectedNewPair, setSelectedNewPair] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const { data: availablePairs = [] } = useQuery({
    queryKey: ['availablePairs'],
    queryFn: () => api.getAvailablePairs(),
  });

  // Get max leverage for each pair (from backend)
  const getMaxLeverage = (symbol: string): number => {
    const pairInfo = availablePairs.find(p => p.symbol === symbol);
    // TODO: Use actual max leverage from backend when available
    return (pairInfo as any)?.maxLeverage || 100;
  };

  // Initialize form when bot loads
  useMemo(() => {
    if (bot) {
      setName(bot.name || '');
      setAutoApprove(!!bot.auto_approve);
      // TODO: Load pairs from bot data when available
      setPairs([
        { symbol: 'BTCUSDT', leverage: 10, tvMultiplier: 1.5, directions: { long: true, short: true } },
        { symbol: 'ETHUSDT', leverage: 'max', tvMultiplier: 2.0, directions: { long: true, short: false } },
      ]);
    }
  }, [bot]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // TODO: Implement save logic
      await new Promise(resolve => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      toast.success('Bot gespeichert');
      qc.invalidateQueries({ queryKey: ['bots'] });
      qc.invalidateQueries({ queryKey: ['bot', botId] });
      navigate('/bots');
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseBot(botId!),
    onSuccess: () => {
      toast.success('Bot pausiert');
      qc.invalidateQueries({ queryKey: ['bot', botId] });
      navigate('/bots');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBot(botId!),
    onSuccess: () => {
      toast.success('Bot gelöscht');
      navigate('/bots');
    },
  });

  const applyGlobal = () => {
    if (globalLeverage !== '' || globalMultiplier !== '') {
      setPairs(prev => prev.map(p => {
        let newLeverage = p.leverage;
        if (globalLeverage !== '') {
          const maxLev = getMaxLeverage(p.symbol);
          if (globalLeverage === 'max') {
            newLeverage = 'max';
          } else {
            newLeverage = Math.min(globalLeverage, maxLev);
          }
        }
        return {
          ...p,
          leverage: newLeverage,
          tvMultiplier: globalMultiplier !== '' ? globalMultiplier : p.tvMultiplier,
        };
      }));
    }
  };

  const addPair = () => {
    if (selectedNewPair && !pairs.find(p => p.symbol === selectedNewPair)) {
      setPairs(prev => [...prev, {
        symbol: selectedNewPair,
        leverage: 10,
        tvMultiplier: 1.0,
        directions: { long: true, short: true },
      }]);
      setSelectedNewPair('');
      setAddPairDialogOpen(false);
    }
  };

  const removePair = (symbol: string) => {
    setPairs(prev => prev.filter(p => p.symbol !== symbol));
  };

  const updatePair = (symbol: string, updates: Partial<BotPair>) => {
    setPairs(prev => prev.map(p => p.symbol === symbol ? { ...p, ...updates } : p));
  };

  const filteredPairs = useMemo(() => {
    let result = pairs.filter(p => p.symbol.toLowerCase().includes(searchPair.toLowerCase()));
    result.sort((a, b) => {
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sortBy === 'leverage') {
        const aLev = a.leverage === 'max' ? 999 : a.leverage;
        const bLev = b.leverage === 'max' ? 999 : b.leverage;
        return aLev - bLev;
      }
      return a.tvMultiplier - b.tvMultiplier;
    });
    return result;
  }, [pairs, searchPair, sortBy]);

  if (isLoading && !isNew) return <div>Lade Bot-Details…</div>;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/bots')}
        className="mb-2"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Zurück
      </Button>

      {/* Header Card */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <Label>Bot Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Bot Name"
              className="mt-1"
            />
          </div>

          {!isNew && bot && (
            <>
              <div>
                <Label>UUID</Label>
                <div className="relative mt-1">
                  <Input 
                    value={bot.uuid || '—'} 
                    readOnly
                    className="pr-10"
                  />
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => copyToClipboard(bot.uuid || '', 'UUID')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Secret</Label>
                <div className="relative mt-1">
                  <Input 
                    value={bot.secret || '—'} 
                    type={showSecret ? 'text' : 'password'}
                    readOnly
                    className="pr-20"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => setShowSecret(!showSecret)}
                      className="h-8 w-8"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => copyToClipboard(bot.secret || '', 'Secret')}
                      className="h-8 w-8"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Label htmlFor="autoApprove">Auto-Approve</Label>
            <Switch
              id="autoApprove"
              checked={autoApprove}
              onCheckedChange={setAutoApprove}
            />
          </div>
        </CardContent>
      </Card>

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Globale Einstellungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Leverage (für alle)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0-100"
                value={globalLeverage === 'max' ? '' : globalLeverage}
                className="w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') setGlobalLeverage('');
                  else {
                    const num = parseFloat(val);
                    if (!isNaN(num) && num >= 0 && num <= 100) setGlobalLeverage(num);
                  }
                }}
              />
            </div>
            <Slider
              value={[globalLeverage === 'max' || globalLeverage === '' ? 0 : globalLeverage]}
              onValueChange={([val]) => setGlobalLeverage(val)}
              min={0}
              max={100}
              step={1}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>TV Multiplier (für alle)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="z.B. 1.5"
              value={globalMultiplier}
              className="w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              onChange={(e) => {
                const val = e.target.value;
                setGlobalMultiplier(val === '' ? '' : parseFloat(val));
              }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Margin</Label>
              <select
                value={marginType}
                onChange={(e) => setMarginType(e.target.value as any)}
                className="w-40 h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="isolated">Isolated</option>
                <option value="cross">Cross</option>
                <option value="auto">Shpatsbot Auto</option>
              </select>
            </div>
            <div className={`flex items-center gap-2 ${marginType === 'auto' ? 'opacity-50 pointer-events-none' : ''}`}>
              <select
                value={marginUnit}
                onChange={(e) => setMarginUnit(e.target.value as any)}
                disabled={marginType === 'auto'}
                className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="percent_bot">in % total USDT per Bot</option>
                <option value="percent_trade">in % total USDT per Trade</option>
                <option value="usdt_bot">in USDT per Bot</option>
                <option value="usdt_trade">in USDT per Trade</option>
              </select>
              <Input
                type="number"
                step="0.1"
                placeholder={marginUnit.startsWith('percent') ? '%' : 'USDT'}
                value={marginValue}
                disabled={marginType === 'auto'}
                className="w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setMarginValue('');
                  } else {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                      // Limit to 100 if percentage
                      if (marginUnit.startsWith('percent')) {
                        setMarginValue(Math.min(num, 100));
                      } else {
                        setMarginValue(num);
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          <Button onClick={applyGlobal} className="w-full">
            Übernehmen
          </Button>
        </CardContent>
      </Card>

      {/* Pairs List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trading Pairs</CardTitle>
          <Dialog open={addPairDialogOpen} onOpenChange={setAddPairDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Pair
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Pair hinzufügen</DialogTitle>
              </DialogHeader>
              <Command className="rounded-lg border">
                <CommandInput placeholder="Pair suchen..." />
                <CommandEmpty>Kein Pair gefunden.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto">
                  {availablePairs
                    .filter(p => !pairs.find(pair => pair.symbol === p.symbol))
                    .map((pair) => (
                      <CommandItem
                        key={pair.symbol}
                        value={pair.symbol}
                        onSelect={() => setSelectedNewPair(pair.symbol)}
                        className="cursor-pointer"
                      >
                        <span className="mr-2 text-lg">{pair.icon}</span>
                        <span className="font-medium">{pair.symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{pair.name}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </Command>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setAddPairDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={addPair} disabled={!selectedNewPair}>
                  Hinzufügen
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSortBy('symbol')}>Alphabetisch</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('leverage')}>Leverage</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('multiplier')}>Einsatz</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="divide-y divide-border">
            {filteredPairs.map(pair => {
              const pairInfo = availablePairs.find(p => p.symbol === pair.symbol);
              const maxLev = getMaxLeverage(pair.symbol);
              return (
                <div key={pair.symbol} className="py-1 flex items-start gap-1.5">
                  {/* Icon */}
                  <div className="w-6 h-6 rounded-full bg-[#FF9500] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm">{pairInfo?.icon || '●'}</span>
                  </div>

                  {/* Symbol + Long/Short Buttons */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium leading-tight truncate">{pair.symbol}</span>
                    <div className="flex gap-0.5">
                      <Button
                        size="sm"
                        variant={pair.directions.long ? 'default' : 'outline'}
                        className={`h-5 px-1.5 text-[10px] leading-none ${pair.directions.long ? 'bg-[#0D3512] hover:bg-[#0D3512]/90 text-[#2DFB68]' : ''}`}
                        onClick={() => updatePair(pair.symbol, {
                          directions: { ...pair.directions, long: !pair.directions.long }
                        })}
                      >
                        Long
                      </Button>
                      <Button
                        size="sm"
                        variant={pair.directions.short ? 'destructive' : 'outline'}
                        className={`h-5 px-1.5 text-[10px] leading-none ${pair.directions.short ? 'bg-[#641812] hover:bg-[#641812]/90 text-[#EA3A10]' : ''}`}
                        onClick={() => updatePair(pair.symbol, {
                          directions: { ...pair.directions, short: !pair.directions.short }
                        })}
                      >
                        Short
                      </Button>
                    </div>
                  </div>

                  {/* Leverage */}
                  <div className="flex flex-col gap-0.5 w-14 shrink-0 ml-auto">
                    <span className="text-[9px] text-muted-foreground leading-tight">Leverage</span>
                    <Input
                      type="number"
                      min="0"
                      max={maxLev}
                      value={pair.leverage === 'max' ? '' : pair.leverage}
                      className="h-6 text-xs px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          updatePair(pair.symbol, { leverage: 10 });
                        } else {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0) {
                            updatePair(pair.symbol, { leverage: Math.min(num, maxLev) });
                          }
                        }
                      }}
                    />
                  </div>

                  {/* Einsatz */}
                  <div className="flex flex-col gap-0.5 w-14 shrink-0">
                    <span className="text-[9px] text-muted-foreground leading-tight">Einsatz</span>
                    <Input
                      type="number"
                      step="0.1"
                      value={pair.tvMultiplier}
                      className="h-6 text-xs px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      onChange={(e) => updatePair(pair.symbol, {
                        tvMultiplier: parseFloat(e.target.value) || 1.0
                      })}
                    />
                  </div>

                  {/* Delete Button */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removePair(pair.symbol)}
                    aria-label="Delete pair"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {filteredPairs.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Keine Pairs gefunden.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="fixed bottom-16 left-0 right-0 bg-card border-t p-3 flex gap-3 z-50">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex-1"
        >
          <Save className="mr-2 h-4 w-4" />
          {isNew ? 'Speichern' : 'Speichern'}
        </Button>

        {!isNew && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex-1">
                Aktionen
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="z-50">
              <DropdownMenuItem onClick={() => pauseMutation.mutate()}>
                Bot pausieren
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (confirm('Bot wirklich löschen?')) deleteMutation.mutate();
                }}
                className="text-destructive"
              >
                Bot löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isNew && (
          <Button
            variant="outline"
            onClick={() => navigate('/bots')}
            className="flex-1"
          >
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}
