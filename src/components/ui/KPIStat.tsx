
type Props = { title: string; value: string | number; subtitle?: string };
export default function KPIStat({ title, value, subtitle }: Props){
  return (
    <div className="p-4 rounded-xl border shadow-sm min-w-[180px]">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
