
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
      // naive toast
      // In real app, use your toast system
      console.log("Kopiert");
    } catch {}
  };

  return (
    <div className={"flex items-center gap-2 " + (className ?? "")}>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <button onClick={onCopy} className="px-2 py-1 text-sm rounded border">{visible ? value : masked}</button>
      {!copyOnly && (
        <button aria-label="toggle" onClick={() => setVisible(v => !v)} className="px-2 py-1 text-sm rounded border">
          {visible ? "🙈" : "👁️"}
        </button>
      )}
    </div>
  );
}
