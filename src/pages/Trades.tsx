// src/pages/Trades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { api, type PositionListItem, apiRequest } from "@/lib/api";
import TradesFiltersBar, { type TradesFilters } from "@/components/app/TradesFiltersBar";
import TradeCardCompact from "@/components/app/TradeCardCompact";
import TradeDetailPanel from "@/components/app/TradeDetailPanel";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";


// Hilfstyp zum Gruppieren nach Datum
type Grouped<T> = {
  date: string;
  label: string;
  items: T[];
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function labelForDate(dateIso: string): string {
  const d = new Date(dateIso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return "Heute";
  if (isSameDay(d, yesterday)) return "Gestern";

  return d.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function groupByDate(items: PositionListItem[], kind: "open" | "closed"): Grouped<PositionListItem>[] {
  const map = new Map<string, PositionListItem[]>();

  for (const it of items) {
    const raw =
      kind === "open"
        ? it.opened_at ?? new Date().toISOString()
        : it.closed_at ?? it.opened_at ?? new Date().toISOString();

    const d = new Date(raw);
    const key = d.toISOString().slice(0, 10); // yyyy-mm-dd

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }

  const arr: Grouped<PositionListItem>[] = Array.from(map.entries()).map(([date, pos]) => ({
    date,
    label: labelForDate(date),
    // innerhalb eines Tages: neueste oben
    items: pos.sort((a, b) => {
      const da = (kind === "open" ? a.opened_at : a.closed_at) ?? a.opened_at ?? "1970-01-01";
      const db = (kind === "open" ? b.opened_at : b.closed_at) ?? b.opened_at ?? "1970-01-01";
      return db.localeCompare(da);
    }),
  }));

  // Tage selbst auch absteigend
  arr.sort((a, b) => b.date.localeCompare(a.date));

  return arr;
}

const TradesPage: React.FC = () => {
  // Filterzustand muss zu deinem TradesFiltersBar.tsx passen
  const [filters, setFilters] = useState<TradesFilters>({
    status: "open",
    symbol: "",
    botId: "",
    side: "all",
    search: "",
  });

  // für die Filterbar
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [availableBots, setAvailableBots] = useState<{ id: number; name: string }[]>([]);

  // Daten
  const [openTrades, setOpenTrades] = useState<PositionListItem[]>([]);
  const [closedTrades, setClosedTrades] = useState<PositionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  // Tabs (wir synchronisieren Tab <-> filters.status)
  const activeTab = filters.status; // "open" | "closed"
  const navigate = useNavigate();


  // Verfügbare Symbole & Bots laden (wie im Dashboard)
  useEffect(() => {
    (async () => {
      try {
        // Bots
        const botRows = await apiRequest<any[]>("/api/v1/bots");
        setAvailableBots((botRows ?? []).map((b) => ({ id: b.id, name: b.name })));
      } catch {
        setAvailableBots([]);
      }

      // Historische Trades-Symbolliste versuchen
      try {
        const hist = await apiRequest<string[]>("/api/v1/trades/symbols");
        if (Array.isArray(hist) && hist.length) {
          setAvailableSymbols(hist);
        } else {
          throw new Error("no hist");
        }
      } catch {
        // Fallback: globale Symbols
        try {
          const all = await api.getSymbols();
          setAvailableSymbols(all ?? []);
        } catch {
          setAvailableSymbols([]);
        }
      }
    })();
  }, []);

  // Trades laden immer dann, wenn "harte" Filter sich ändern
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const bot_id =
          filters.botId && filters.botId.trim().length
            ? Number(filters.botId)
            : undefined;
        const side =
          filters.side && filters.side !== "all" ? (filters.side as "long" | "short") : undefined;

        // offene holen
        const openRes = await api.getPositions({
          status: "open",
          symbol: filters.symbol || undefined,
          bot_id,
          side,
        });

        // geschlossene holen
        const closedRes = await api.getPositions({
          status: "closed",
          symbol: filters.symbol || undefined,
          bot_id,
          side,
        });

        setOpenTrades(openRes.items ?? []);
        setClosedTrades(closedRes.items ?? []);

        // wenn noch nichts ausgewählt → ersten aus dem aktuell aktiven Tab nehmen
        if (!selectedId) {
          if (filters.status === "open") {
            const first = (openRes.items ?? [])[0];
            if (first) setSelectedId(first.id);
          } else {
            const first = (closedRes.items ?? [])[0];
            if (first) setSelectedId(first.id);
          }
        }
      } catch (err) {
        console.error("Fehler beim Laden der Trades", err);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
    // nur laden bei diesen Änderungen – search machen wir client-seitig
  }, [filters.status, filters.symbol, filters.botId, filters.side, selectedId]);

  // client-seitige Suche
  const filteredOpen = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    if (!term) return openTrades;
    return openTrades.filter((t) => {
      const inSymbol = t.symbol?.toLowerCase().includes(term);
      const inBot = t.bot_name?.toLowerCase().includes(term);
      return inSymbol || inBot;
    });
  }, [openTrades, filters.search]);

  const filteredClosed = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    if (!term) return closedTrades;
    return closedTrades.filter((t) => {
      const inSymbol = t.symbol?.toLowerCase().includes(term);
      const inBot = t.bot_name?.toLowerCase().includes(term);
      return inSymbol || inBot;
    });
  }, [closedTrades, filters.search]);

  // gruppieren
  const openGroups = useMemo(() => groupByDate(filteredOpen, "open"), [filteredOpen]);
  const closedGroups = useMemo(() => groupByDate(filteredClosed, "closed"), [filteredClosed]);

  // wenn Tab geklickt wird → auch Filter-Status umschalten
  const handleTabChange = (val: string) => {
    const tab = val === "closed" ? "closed" : "open";
    setFilters((prev) => ({ ...prev, status: tab }));
    // beim Tab-Wechsel gleich ersten Eintrag auswählen
    if (tab === "open") {
      const first = filteredOpen[0];
      setSelectedId(first ? first.id : null);
    } else {
      const first = filteredClosed[0];
      setSelectedId(first ? first.id : null);
    }
  };

  // wenn Filterbar etwas ändert
  const handleFiltersChange = (next: TradesFilters) => {
    setFilters(next);
    // selectedId nicht sofort löschen, weil Detail rechts sonst flackert
  };

  return (
    <DashboardLayout pageTitle="Trades">
      <div className="flex flex-col h-full gap-4">
        {/* Kopfzeile */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Trades</h2>
          <Button
            variant={showFilters ? "outline" : "ghost"}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Filterleiste */}
        {showFilters && (
          <TradesFiltersBar
            value={filters}
            onChange={handleFiltersChange}
            availableSymbols={availableSymbols}
            availableBots={availableBots}
          />
        )}

        <div className="flex gap-4 h-[calc(100vh-220px)]">
          {/* Liste */}
          <div className="flex-1 overflow-y-auto pr-2">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-4">
                <TabsTrigger value="open">Offene Trades</TabsTrigger>
                <TabsTrigger value="closed">Geschlossene Trades</TabsTrigger>
              </TabsList>

              {/* offene */}
              <TabsContent value="open" className="m-0">
                {openGroups.map((group) => (
                  <div key={`open-${group.date}`} className="mb-5">
                    <div className="text-xs text-muted-foreground mb-2 border-b pb-1">
                      {group.label}
                    </div>
                    <div className="flex flex-col gap-2">
                      {group.items.map((t) => (
                        <TradeCardCompact
                          key={t.id}
                          trade={t}
                          isSelected={false}
                          onSelect={() => navigate(`/trade/${t.id}`)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="text-sm text-muted-foreground">Lade offene Trades…</div>
                )}
                {!isLoading && openGroups.length === 0 && (
                  <div className="text-sm text-muted-foreground">Keine offenen Trades gefunden.</div>
                )}
              </TabsContent>

              {/* geschlossene */}
              <TabsContent value="closed" className="m-0">
                {closedGroups.map((group) => (
                  <div key={`closed-${group.date}`} className="mb-5">
                    <div className="text-xs text-muted-foreground mb-2 border-b pb-1">
                      {group.label}
                    </div>
                    <div className="flex flex-col gap-2">
                      {group.items.map((t) => (
                        <TradeCardCompact
                          key={t.id}
                          trade={t}
                          isSelected={false}
                          onSelect={() => navigate(`/trade/${t.id}`)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="text-sm text-muted-foreground">Lade geschlossene Trades…</div>
                )}
                {!isLoading && closedGroups.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Keine geschlossenen Trades gefunden.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TradesPage;
