import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatTsh } from "@/lib/aviator";
import { Panel, StatCard } from "./shared";

type Stats = {
  staked: number;
  paid: number;
  bets: number;
  players: number;
  users_total: number;
  balances_total: number;
  daily: { day: string; staked: number; paid: number }[];
};

const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function AdminOverview() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    void supabase.rpc("admin_stats", { _days: days }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setStats(data as unknown as Stats);
    });
  }, [days]);

  const staked = Number(stats?.staked ?? 0);
  const paid = Number(stats?.paid ?? 0);
  const profit = staked - paid;
  const margin = staked > 0 ? (profit / staked) * 100 : 0;
  const daily = stats?.daily ?? [];
  const maxDay = Math.max(1, ...daily.map((d) => Math.abs(Number(d.staked) - Number(d.paid))));

  return (
    <Panel
      title="Profit"
      description="Real-mode results. Profit = total staked minus total paid out."
      actions={
        <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-bold">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`rounded-full px-3 py-1 ${days === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!stats && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Profit" value={formatTsh(profit)} tone={profit >= 0 ? "good" : "bad"} />
            <StatCard label="Margin" value={`${margin.toFixed(1)}%`} tone={margin >= 0 ? "good" : "bad"} />
            <StatCard label="Total staked" value={formatTsh(staked)} />
            <StatCard label="Paid out" value={formatTsh(paid)} />
            <StatCard label="Bets" value={String(stats.bets)} />
            <StatCard label="Active players" value={String(stats.players)} />
            <StatCard label="Registered players" value={String(stats.users_total)} />
            <StatCard label="Player balances" value={formatTsh(Number(stats.balances_total))} />
          </div>
          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Profit per day</h3>
          {daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finished real bets in this period yet.</p>
          ) : (
            <div className="space-y-1.5">
              {[...daily].reverse().map((d) => {
                const p = Number(d.staked) - Number(d.paid);
                return (
                  <div key={d.day} className="grid grid-cols-[88px_1fr_110px] items-center gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">{d.day}</span>
                    <div className="h-2.5 rounded-full bg-muted">
                      <div className={`h-full rounded-full ${p >= 0 ? "bg-tier-low" : "bg-destructive"}`} style={{ width: `${(Math.abs(p) / maxDay) * 100}%` }} />
                    </div>
                    <span className={`text-right font-bold tabular-nums ${p >= 0 ? "text-tier-low" : "text-destructive"}`}>{formatTsh(p)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
