
import { useEffect, useMemo, useState } from "react";

export type Filters = {
  botIds: number[];
  symbols: string[];
  dateFrom?: string; // DD.MM.YYYY
  dateTo?: string;
  openHour?: string; // HH:MM-HH:MM
  closeHour?: string;
  kind?: 'all'|'automatic'|'manual'; // for Signals
};

type Props = {
  value: Filters;
  onChange: (f: Filters) => void;
  showKind?: boolean;
};

const pad = (n:number)=> n<10?`0${n}`:`${n}`;
const toLocalISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

export default function FiltersBar({ value, onChange, showKind }: Props) {
  const [local, setLocal] = useState<Filters>(value);
  useEffect(()=>setLocal(value),[value]);

  const apply = () => onChange(local);

  return (
    <div className="flex flex-wrap items-end gap-2 p-2 border rounded-md">
      <div className="flex flex-col">
        <label className="text-xs">Bots (IDs, Komma-getrennt)</label>
        <input className="input input-bordered px-2 py-1 rounded border"
          placeholder="z.B. 1,2,3"
          value={local.botIds.join(",")}
          onChange={(e)=> setLocal({...local, botIds: e.target.value.split(",").map(s=>parseInt(s)).filter(n=>!isNaN(n))})}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">Coins</label>
        <input className="input input-bordered px-2 py-1 rounded border"
          placeholder="BTCUSDT,SOLUSDT"
          value={local.symbols.join(",")}
          onChange={(e)=> setLocal({...local, symbols: e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">Datum von (TT.MM.JJJJ)</label>
        <input className="input input-bordered px-2 py-1 rounded border"
          placeholder="01.10.2025"
          value={local.dateFrom ?? ""}
          onChange={(e)=> setLocal({...local, dateFrom: e.target.value})}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">Datum bis (TT.MM.JJJJ)</label>
        <input className="input input-bordered px-2 py-1 rounded border"
          placeholder="19.10.2025"
          value={local.dateTo ?? ""}
          onChange={(e)=> setLocal({...local, dateTo: e.target.value})}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">Uhrzeit-Range (Open)</label>
        <input className="input input-bordered px-2 py-1 rounded border"
          placeholder="00:00-06:00"
          value={local.openHour ?? ""}
          onChange={(e)=> setLocal({...local, openHour: e.target.value})}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">Uhrzeit-Range (Close)</label>
        <input className="input input-bordered px-2 py-1 rounded border"
          placeholder="22:00-04:00"
          value={local.closeHour ?? ""}
          onChange={(e)=> setLocal({...local, closeHour: e.target.value})}
        />
      </div>
      {showKind && (
        <div className="flex flex-col">
          <label className="text-xs">Signal-Art</label>
          <select className="px-2 py-1 rounded border" value={local.kind ?? 'all'} onChange={(e)=> setLocal({...local, kind: e.target.value as any})}>
            <option value="all">Alle</option>
            <option value="automatic">Automatisch</option>
            <option value="manual">Manuell</option>
          </select>
        </div>
      )}
      <button className="px-3 py-1 rounded border ml-auto" onClick={apply}>Übernehmen</button>
    </div>
  );
}
