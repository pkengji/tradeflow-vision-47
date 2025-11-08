
import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "./button";

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
    <div className={"space-y-1 " + (className ?? "")}>
      {label && <span className="text-sm font-medium">{label}</span>}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <code className="block w-full px-3 py-2 text-sm rounded-md border bg-muted font-mono pr-20">
            {visible ? value : masked}
          </code>
          {!copyOnly && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setVisible(v => !v)}
              className="absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8"
              aria-label={visible ? "Verbergen" : "Anzeigen"}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={onCopy}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            aria-label="Kopieren"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
