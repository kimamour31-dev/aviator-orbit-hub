import { Activity, AlertTriangle, Gauge, Radio, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatTsh } from "@/lib/aviator";
import { GhostButton, Panel, StatCard } from "./shared";

type Telemetry = {
  active_rounds: number;
  bets_last_60s: number;
  staked_last_60s: number;
  payout_last_60s: number;
  players_online: number;
  players_24h: number;
  rounds_24h: number;
  last_round_id: string | null;
  last_round_crash: number | null;
  last_round_at: string | null;
  active_seed_hash: string | null;
  maintenance_on: boolean;
  real_mode_on: boolean;
};

type Financials = {
  ggr: number;
  ngr: number;
  paid_out: number;
  deposits_total: number;
  deposits_count: number;
  withdrawals_total: number;
  withdrawals_count: number;
  pending_deposits: number;
  pending_withdrawals: number;
  house_edge_setting: number;
  real_margin_pct: number;
  daily: { day: string; ggr: number; ngr: number; payout: number }[];
  deposit_daily: { day: string; deposits: number }[];
};

const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function AdminAnalytics() {
  const [tele, setTele] = useState<Telemetry | null>(null);
  const [days, setDays] = useState(7);
  const [fin, setFin] = useState<Financials | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, f] = await Promise.all([
      supabase.rpc("admin_telemetry"),
      supabase.rpc("admin_financials", { _days: days }),
    ]);
    setLoading(false);
    if (t.error) toast.error(t.error.message);
    else setTele(t.data as unknown as Telemetry);
    if (f.error) toast.error(f.error.message);
    else setFin(f.data as unknown as Financials);
  }, [days]);

  useEffect(() => { void load(); }, [load, tick]);

  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const daily = fin?.daily ?? [];
  const maxDay = Math.max(1, ...daily.map((d) => Math.abs(Number(d.ngr))));
  const depositDaily = fin?.deposit_daily ?? [];
  const maxDep = Math.max(1, ...depositDaily.map((d) => Number(d.deposits)));

  return (
    <div className="space-y-4">
      <Panel
        title="Live telemetry"
        description="Real-time snapshot of the game right now. Refreshes every 15 seconds."
        actions={
          <GhostButton onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
        }
      >
        {!tele && !loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {tele && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Players online" value={String(tele.players_online)} />
              <StatCard label="Active rounds" value={String(tele.active_rounds)} />
              <StatCard label="Bets (60s)" value={String(tele.bets_last_60s)} />
              <StatCard label="Players (24h)" value={String(tele.players_24h)} />
              <StatCard label="Staked (60s)" value={formatTsh(Number(tele.staked_last_60s))} />
              <StatCard label="Paid out (60s)" value={formatTsh(Number(tele.payout_last_60s))} />
              <StatCard label="Rounds (24h)" value={String(tele.rounds_24h)} />
              <StatCard
                label="Net (60s)"
                value={formatTsh(Number(tele.staked_last_60s) - Number(tele.payout_last_60s))}
                tone={Number(tele.staked_last_60s) - Number(tele.payout_last_60s) >= 0 ? "good" : "bad"}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Radio className={`size-3.5 ${tele.real_mode_on ? "text-tier-low" : "text-destructive"}`} />
                Real mode: {tele.real_mode_on ? "ON" : "OFF"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={`flex items-center gap-1.5 font-semibold ${tele.maintenance_on ? "text-gold" : "text-muted-foreground"}`}>
                <AlertTriangle className="size-3.5" /> Maintenance: {tele.maintenance_on ? "ON" : "off"}
              </span>
              {tele.last_round_crash !== null && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Gauge className="size-3.5 text-gold" /> Last crash: {Number(tele.last_round_crash).toFixed(2)}x
                  </span>
                </>
              )}
              {tele.active_seed_hash && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Activity className="size-3.5" /> Seed: {tele.active_seed_hash.slice(0, 12)}…
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Financial overview"
        description="GGR (total staked) and NGR (net gaming revenue = staked minus paid out) across the selected period."
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
        {!fin && !loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {fin && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="GGR" value={formatTsh(Number(fin.ggr))} />
              <StatCard label="NGR (net)" value={formatTsh(Number(fin.ngr))} tone={Number(fin.ngr) >= 0 ? "good" : "bad"} />
              <StatCard label="Paid out" value={formatTsh(Number(fin.paid_out))} />
              <StatCard label="Real margin" value={`${Number(fin.real_margin_pct).toFixed(1)}%`} tone={Number(fin.real_margin_pct) >= 0 ? "good" : "bad"} />
              <StatCard label="Deposits" value={formatTsh(Number(fin.deposits_total))} />
              <StatCard label="Deposit count" value={String(fin.deposits_count)} />
              <StatCard label="Withdrawals" value={formatTsh(Number(fin.withdrawals_total))} />
              <StatCard label="Withdrawal count" value={String(fin.withdrawals_count)} />
              <StatCard label="Pending deposits" value={formatTsh(Number(fin.pending_deposits))} tone="bad" />
              <StatCard label="Pending withdrawals" value={formatTsh(Number(fin.pending_withdrawals))} tone="bad" />
              <StatCard label="House edge" value={`${(Number(fin.house_edge_setting) * 100).toFixed(1)}%`} />
              <StatCard label="Period" value={`${days}d`} />
            </div>

            {daily.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Net revenue per day</h3>
                <div className="space-y-1.5">
                  {[...daily].reverse().map((d) => {
                    const ngr = Number(d.ngr);
                    return (
                      <div key={d.day} className="grid grid-cols-[88px_1fr_110px] items-center gap-2 text-xs">
                        <span className="tabular-nums text-muted-foreground">{d.day}</span>
                        <div className="h-2.5 rounded-full bg-muted">
                          <div className={`h-full rounded-full ${ngr >= 0 ? "bg-tier-low" : "bg-destructive"}`} style={{ width: `${(Math.abs(ngr) / maxDay) * 100}%` }} />
                        </div>
                        <span className={`text-right font-bold tabular-nums ${ngr >= 0 ? "text-tier-low" : "text-destructive"}`}>{formatTsh(ngr)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {depositDaily.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Deposits per day</h3>
                <div className="space-y-1.5">
                  {[...depositDaily].reverse().map((d) => (
                    <div key={d.day} className="grid grid-cols-[88px_1fr_110px] items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted-foreground">{d.day}</span>
                      <div className="h-2.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-gold" style={{ width: `${(Number(d.deposits) / maxDep) * 100}%` }} />
                      </div>
                      <span className="text-right font-bold tabular-nums text-foreground">{formatTsh(Number(d.deposits))}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
