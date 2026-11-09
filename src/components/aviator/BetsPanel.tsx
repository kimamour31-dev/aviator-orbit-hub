import { useState } from "react";
import type { MyBet, Phase, SimBet } from "@/hooks/use-aviator-game";
import { formatMult, formatTsh, payout } from "@/lib/aviator";
import { cn } from "@/lib/utils";

type Props = {
  phase: Phase;
  simBets: SimBet[];
  myBets: MyBet[];
  topWins: MyBet[];
};

export function BetsPanel({ phase, simBets, myBets, topWins }: Props) {
  const [tab, setTab] = useState<"all" | "mine" | "top">("all");
  const total = simBets.reduce((a, b) => a + b.stake, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-3 border-b border-border text-xs font-semibold">
        {(
          [
            ["all", "All Bets"],
            ["mine", "My Bets"],
            ["top", "Top Wins"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "border-b-2 py-3 transition-colors",
              tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <>
          <div className="flex items-center justify-between px-4 py-2 text-xs">
            <span className="text-muted-foreground">
              Bets: <span className="font-bold text-foreground">{simBets.length}</span>
            </span>
            <span className="font-bold text-primary">{formatTsh(total)}</span>
          </div>
          <p className="px-4 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Simulated players · demo</p>
          <ul className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
            {simBets.map((b) => {
              const won = b.cashedAt !== null;
              const lost = phase === "crashed" && !won;
              return (
                <li
                  key={b.name}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
                    won ? "border-bet/50 bg-bet/10" : "border-border bg-background",
                    lost && "opacity-50",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                    {b.name[0]}
                  </span>
                  <span className="flex-1 truncate font-semibold text-foreground">{b.name}</span>
                  <span className="text-muted-foreground tabular-nums">{formatTsh(b.stake)}</span>
                  <span
                    className={cn(
                      "w-14 rounded-md py-0.5 text-center font-bold tabular-nums",
                      won ? "bg-bet/20 text-bet" : "text-muted-foreground",
                    )}
                  >
                    {won ? formatMult(b.cashedAt!) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab !== "all" && (
        <ul className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {(tab === "mine" ? myBets : topWins).length === 0 && (
            <li className="py-10 text-center text-sm text-muted-foreground">
              {tab === "mine" ? "Your bets will appear here." : "Cash out to land on the leaderboard."}
            </li>
          )}
          {(tab === "mine" ? myBets : topWins).map((b) => (
            <li
              key={`${b.id}-${b.time}`}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
                b.cashedAt ? "border-bet/50 bg-bet/10" : "border-border bg-background",
              )}
            >
              <span className="w-14 text-muted-foreground">#{String(b.round).padStart(5, "0")}</span>
              <span className="flex-1 tabular-nums text-foreground">{formatTsh(b.stake)}</span>
              <span className={cn("w-12 text-center font-bold tabular-nums", b.cashedAt ? "text-bet" : "text-primary")}>
                {b.cashedAt ? formatMult(b.cashedAt) : "Lost"}
              </span>
              <span className="w-20 text-right font-semibold tabular-nums text-foreground">
                {b.cashedAt ? formatTsh(payout(b.stake, b.cashedAt)) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
