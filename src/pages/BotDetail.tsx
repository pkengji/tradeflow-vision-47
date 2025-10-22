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
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseBot(botId!),
    onSuccess: () => {
      toast.success('Bot pausiert');
      qc.invalidateQueries({ queryKey: ['bot', botId] });
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
    const newSymbol = prompt('Symbol eingeben (z.B. BTCUSDT):');
    if (newSymbol) {
      setPairs(prev => [...prev, {
        symbol: newSymbol.toUpperCase(),
        leverage: 10,
        tvMultiplier: 1.0,
        directions: { long: true, short: true },
      }]);
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
    <div className="space-y-6 p-4 lg:p-6 pb-24">
      {/* Header Card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Bot Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bot Name" />
          </div>

          {!isNew && bot && (
            <>
              <div>
                <Label>UUID</Label>
                <MaskedSecret value={bot.uuid || '—'} copyOnly />
              </div>

              <div>
                <Label>Secret</Label>
                <MaskedSecret value={bot.secret || '—'} />
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-3 border-t">
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
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Leverage (für alle)</Label>
              <Input
                placeholder="z.B. 10 oder 'max'"
                value={globalLeverage}
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
              <Label>TV Multiplier (für alle)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="z.B. 1.5"
                value={globalMultiplier}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalMultiplier(val === '' ? '' : parseFloat(val));
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={applyGlobal} className="w-full">
                Übernehmen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pairs List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trading Pairs</CardTitle>
          <Button size="sm" onClick={addPair}>
            <Plus className="mr-1 h-4 w-4" />
            Pair hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pair suchen..."
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                className="pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Sortieren</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSortBy('symbol')}>Alphabetisch</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('leverage')}>Leverage</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('multiplier')}>Einsatz</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            {filteredPairs.map(pair => (
              <div key={pair.symbol} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                  <div className="font-medium">{pair.symbol}</div>
                  
                  <div>
                    <Label className="text-xs">Leverage</Label>
                    <Input
                      size={1}
                      placeholder="max"
                      value={pair.leverage}
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePair(pair.symbol, {
                          leverage: val === 'max' ? 'max' : parseFloat(val) || 10
                        });
                      }}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">TV Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={pair.tvMultiplier}
                      onChange={(e) => updatePair(pair.symbol, {
                        tvMultiplier: parseFloat(e.target.value) || 1.0
                      })}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Richtungen</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={pair.directions.long ? 'default' : 'outline'}
                        onClick={() => updatePair(pair.symbol, {
                          directions: { ...pair.directions, long: !pair.directions.long }
                        })}
                      >
                        Long
                      </Button>
                      <Button
                        size="sm"
                        variant={pair.directions.short ? 'default' : 'outline'}
                        onClick={() => updatePair(pair.symbol, {
                          directions: { ...pair.directions, short: !pair.directions.short }
                        })}
                      >
                        Short
                      </Button>
                    </div>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removePair(pair.symbol)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredPairs.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                Keine Pairs gefunden.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sticky Action Buttons */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-3 px-4 z-50">
        <Button
          size="lg"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="shadow-lg"
        >
          <Save className="mr-2 h-5 w-5" />
          {isNew ? 'Speichern und aktivieren' : 'Speichern'}
        </Button>

        {!isNew && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" variant="outline" className="shadow-lg">
                Aktionen
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => pauseMutation.mutate()}>
                Bot pausieren
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (confirm('Bot wirklich löschen?')) deleteMutation.mutate();
                }}
                className="text-red-600"
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
            className="shadow-lg"
          >
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}
