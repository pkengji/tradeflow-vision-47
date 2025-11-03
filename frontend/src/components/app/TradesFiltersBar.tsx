// src/components/app/TradesFiltersBar.tsx
import React from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TradesFilters = {
  status: "open" | "closed" | "all";
  symbol: string; // "" = alle
  botId: string; // "" = alle
  side: "all" | "long" | "short";
  search: string;
};

type Props = {
  value: TradesFilters;
  onChange: (next: TradesFilters) => void;
  availableSymbols?: string[];
  availableBots?: { id: number; name: string }[];
  className?: string;
};

const EMPTY = "__all__";

export default function TradesFiltersBar({
  value,
  onChange,
  availableSymbols = [],
  availableBots = [],
  className,
}: Props) {
  return (
    <div className={cn("flex flex-wrap gap-3 items-center", className)}>
      {/* Status */}
      <Select
        // hier darf value "" sein – aber das Item darf es nicht
        value={value.status === "all" ? EMPTY : value.status}
        onValueChange={(status) =>
          onChange({
            ...value,
            status: status === EMPTY ? "all" : (status as "open" | "closed"),
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY}>Alle</SelectItem>
          <SelectItem value="open">Offen</SelectItem>
          <SelectItem value="closed">Geschlossen</SelectItem>
        </SelectContent>
      </Select>

      {/* Symbol */}
      <Select
        value={value.symbol === "" ? EMPTY : value.symbol}
        onValueChange={(symbol) =>
          onChange({
            ...value,
            symbol: symbol === EMPTY ? "" : symbol,
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Symbol" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY}>Alle</SelectItem>
          {availableSymbols.map((sym) => (
            <SelectItem key={sym} value={sym}>
              {sym}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Bot */}
      <Select
        value={value.botId === "" ? EMPTY : value.botId}
        onValueChange={(botId) =>
          onChange({
            ...value,
            botId: botId === EMPTY ? "" : botId,
          })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Bot" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY}>Alle</SelectItem>
          {availableBots.map((bot) => (
            <SelectItem key={bot.id} value={String(bot.id)}>
              {bot.name ?? `Bot #${bot.id}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Side */}
      <Select
        value={value.side === "all" ? EMPTY : value.side}
        onValueChange={(side) =>
          onChange({
            ...value,
            side: side === EMPTY ? "all" : (side as "all" | "long" | "short"),
          })
        }
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Richtung" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY}>Alle</SelectItem>
          <SelectItem value="long">Long</SelectItem>
          <SelectItem value="short">Short</SelectItem>
        </SelectContent>
      </Select>

      {/* Suche */}
      <Input
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="Suche..."
        className="w-[200px]"
      />
    </div>
  );
}
