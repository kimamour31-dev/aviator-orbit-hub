import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import type { Phase, Slot } from "@/hooks/use-aviator-game";
import { formatTsh, payout } from "@/lib/aviator";
import { cn } from "@/lib/utils";

type Props = {
  index: 0 | 1;
  slot: Slot;
  phase: Phase;
  multiplier: number;
  onPlace: () => void;
  onCancel: () => void;
  onCashOut: () => void;
  onChange: (patch: Partial<Slot>) => void;
};

const QUICK = [500, 1000, 2000, 5000, 10000];

export function BetConsole({ index, slot, phase, multiplier, onPlace, onCancel, onCashOut, onChange }: Props) {
  const [tab, setTab] = useState<"bet" | "auto">("bet");
  const locked = slot.status !== "none";
  const setAmount = (v: number) => onChange({ amount: Math.max(0, Math.min(1_000_000, Math.round(v))) });

  let button: React.ReactNode;
  if (slot.status === "active" && phase === "flying") {
    button = (
      <button onClick={onCashOut} className="console-btn bg-cashout text-cashout-foreground hover:brightness-110">
        <span className="text-sm font-bold uppercase tracking-wider">Cash out</span>
        <span className="font-display text-xl font-extrabold tabular-nums">{formatTsh(payout(slot.stake, multiplier))}</span>
      </button>
    );
  } else if (slot.status === "queued" || slot.status === "active") {
    button = (
      <button
        onClick={onCancel}
        disabled={slot.status === "active"}
        className="console-btn bg-destructive text-destructive-foreground hover:brightness-110 disabled:opacity-70"
      >
        <span className="text-sm font-bold uppercase tracking-wider">Cancel</span>
        <span className="text-xs opacity-90">{phase === "waiting" ? "Waiting for takeoff" : "Waiting for next round"}</span>
      </button>
    );
  } else {
    button = (
      <button onClick={onPlace} className="console-btn bg-bet text-bet-foreground hover:brightness-110">
        <span className="text-lg font-extrabold uppercase tracking-wider">Bet</span>
        <span className="text-xs font-semibold opacity-90">{formatTsh(slot.amount)}</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex rounded-full bg-muted p-0.5 text-xs font-semibold">
          {(["bet", "auto"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1 capitalize transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bet console #{index + 1}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
            <button
              aria-label="Decrease bet"
              disabled={locked}
              onClick={() => setAmount(slot.amount - 100)}
              className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <input
              aria-label={`Bet amount console ${index + 1}`}
              inputMode="numeric"
              disabled={locked}
              value={slot.amount}
              onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
              className="w-full min-w-0 bg-transparent text-center font-display text-lg font-bold tabular-nums text-foreground outline-none disabled:opacity-60"
            />
            <button
              aria-label="Increase bet"
              disabled={locked}
              onClick={() => setAmount(slot.amount + 100)}
              className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {QUICK.map((q) => (
              <button
                key={q}
                disabled={locked}
                onClick={() => setAmount(q)}
                className="rounded-md bg-muted py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {q >= 1000 ? `${q / 1000}K` : q}
              </button>
            ))}
            <button
              disabled={locked}
              onClick={() => setAmount(slot.amount * 2)}
              className="rounded-md bg-muted py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              2x
            </button>
          </div>
        </div>
        <div className="sm:w-44">{button}</div>
      </div>

      {tab === "auto" && (
        <div className="mt-3 grid gap-3 rounded-xl border border-border bg-background p-3 text-sm sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Auto bet each round</span>
            <Switch checked={slot.autoBet} onCheckedChange={(v) => onChange({ autoBet: v })} />
          </label>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-muted-foreground">
              <Switch checked={slot.autoCashout} onCheckedChange={(v) => onChange({ autoCashout: v })} />
              Auto cash out
            </label>
            <div className="flex items-center rounded-lg border border-border bg-card px-2">
              <input
                aria-label={`Auto cash out multiplier console ${index + 1}`}
                type="number"
                step="0.1"
                min="1.01"
                value={slot.autoCashoutAt}
                onChange={(e) => onChange({ autoCashoutAt: Math.max(1.01, Number(e.target.value) || 1.01) })}
                className="w-16 bg-transparent py-1 text-right font-semibold tabular-nums text-foreground outline-none"
              />
              <span className="text-muted-foreground">x</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
