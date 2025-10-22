
import { useState } from "react";

type Props = {
  label?: string;
  value: string;
  copyOnly?: boolean;
  className?: string;
};

export default function MaskedSecret({ label, value, copyOnly, className }: Props) {
  const [visible, setVisible] = useState(false);

  const masked = "*".repeat(Math.min(value.length, 8)) + (value.length > 8 ? "•••" : "");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      const { toast } = await import('sonner');
      toast.success('In Zwischenablage kopiert');
    } catch {}
  };

  return (
    <div className={"flex items-center gap-2 " + (className ?? "")}>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <code className="px-3 py-1.5 text-sm rounded border bg-muted font-mono cursor-pointer hover:bg-muted/80" onClick={onCopy}>
        {visible ? value : masked}
      </code>
      {!copyOnly && (
        <button 
          aria-label="toggle" 
          onClick={() => setVisible(v => !v)} 
          className="px-2 py-1.5 text-sm rounded border hover:bg-muted transition-colors"
        >
          {visible ? "🙈" : "👁️"}
        </button>
      )}
    </div>
  );
}
