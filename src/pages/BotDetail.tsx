import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Bot } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, Save } from 'lucide-react';
import MaskedSecret from '@/components/ui/MaskedSecret';
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
import { toast } from 'sonner';

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
  const [searchPair, setSearchPair] = useState('');
  const [sortBy, setSortBy] = useState<'symbol' | 'leverage' | 'multiplier'>('symbol');
  const [addPairDialogOpen, setAddPairDialogOpen] = useState(false);
  const [selectedNewPair, setSelectedNewPair] = useState('');

  const { data: availablePairs = [] } = useQuery({
    queryKey: ['availablePairs'],
    queryFn: () => api.getAvailablePairs(),
  });

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
      setPairs(prev => prev.map(p => ({
        ...p,
        leverage: globalLeverage !== '' ? globalLeverage : p.leverage,
        tvMultiplier: globalMultiplier !== '' ? globalMultiplier : p.tvMultiplier,
      })));
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

  return (
    <div className="space-y-3 p-3 lg:p-4 pb-32">
      {/* Header Card */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label className="text-sm">Bot Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Bot Name"
              className="mt-1"
            />
          </div>

      {!isNew && bot && (
        <>
          <MaskedSecret label="UUID" value={bot.uuid || '—'} copyOnly />
          <MaskedSecret label="Secret" value={bot.secret || '—'} />
        </>
      )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Label htmlFor="autoApprove" className="text-sm">Auto-Approve</Label>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Globale Einstellungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Leverage (für alle)</Label>
              <Input
                placeholder="z.B. 10 oder 'max'"
                value={globalLeverage}
                className="mt-1 h-9 text-sm"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'max') setGlobalLeverage('max');
                  else if (val === '') setGlobalLeverage('');
                  else {
                    const num = parseFloat(val);
                    if (!isNaN(num)) setGlobalLeverage(num);
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">TV Multiplier (für alle)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="z.B. 1.5"
                value={globalMultiplier}
                className="mt-1 h-9 text-sm"
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalMultiplier(val === '' ? '' : parseFloat(val));
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={applyGlobal} className="w-full h-9 text-sm">
                Übernehmen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pairs List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Trading Pairs</CardTitle>
          <Dialog open={addPairDialogOpen} onOpenChange={setAddPairDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="mr-1 h-3 w-3" />
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
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
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

          <div className="space-y-1.5">
            {filteredPairs.map(pair => {
              const pairInfo = availablePairs.find(p => p.symbol === pair.symbol);
              return (
                <div key={pair.symbol} className="flex items-center gap-2 p-2 border rounded-lg text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                    <span className="text-base">{pairInfo?.icon || '●'}</span>
                    <span className="font-medium text-xs">{pair.symbol}</span>
                  </div>
                  
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Input
                      placeholder="max"
                      value={pair.leverage}
                      className="h-7 text-xs w-16"
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePair(pair.symbol, {
                          leverage: val === 'max' ? 'max' : parseFloat(val) || 10
                        });
                      }}
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={pair.tvMultiplier}
                      className="h-7 text-xs w-16"
                      onChange={(e) => updatePair(pair.symbol, {
                        tvMultiplier: parseFloat(e.target.value) || 1.0
                      })}
                    />
                  <div>
                    <Button
                      size="sm"
                      variant={pair.directions.long ? 'default' : 'outline'}
                      className={`h-7 px-2 text-xs ${pair.directions.long ? 'bg-long hover:bg-long/80 text-long-foreground' : ''}`}
                      onClick={() => updatePair(pair.symbol, {
                        directions: { ...pair.directions, long: !pair.directions.long }
                      })}
                    >
                      L
                    </Button>
                    <Button
                      size="sm"
                      variant={pair.directions.short ? 'destructive' : 'outline'}
                      className={`h-7 px-2 text-xs ml-1 ${pair.directions.short ? 'bg-short hover:bg-short/80 text-short-foreground' : ''}`}
                      onClick={() => updatePair(pair.symbol, {
                        directions: { ...pair.directions, short: !pair.directions.short }
                      })}
                    >
                      S
                    </Button>
                  </div>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => removePair(pair.symbol)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {filteredPairs.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                Keine Pairs gefunden.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sticky Action Buttons */}
      <div className="fixed bottom-16 md:bottom-6 left-0 right-0 flex justify-center gap-2 px-4 z-[100]">
        <Button
          size="lg"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="shadow-lg h-10"
        >
          <Save className="mr-2 h-4 w-4" />
          {isNew ? 'Speichern' : 'Speichern'}
        </Button>

        {!isNew && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" variant="outline" className="shadow-lg h-10">
                Aktionen
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="z-[100]">
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
            size="lg"
            variant="outline"
            onClick={() => navigate('/bots')}
            className="shadow-lg h-10"
          >
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}
