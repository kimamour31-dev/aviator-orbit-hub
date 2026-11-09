import { History } from "lucide-react";
import { formatMult, tierOf } from "@/lib/aviator";
import { cn } from "@/lib/utils";

const tierClass = {
  low: "border-tier-low/40 bg-tier-low/10 text-tier-low",
  mid: "border-tier-mid/40 bg-tier-mid/10 text-tier-mid",
  high: "border-tier-high/40 bg-tier-high/10 text-tier-high",
} as const;

export function HistoryStrip({ history }: { history: number[] }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
      <div className="flex flex-1 gap-1.5 overflow-hidden">
        {history.map((m, i) => (
          <span
            key={`${i}-${m}`}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
              tierClass[tierOf(m)],
              i === 0 && "animate-in fade-in zoom-in-75",
            )}
          >
            {formatMult(m)}
          </span>
        ))}
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
        <History className="size-3.5" /> History
      </span>
    </div>
  );
}
