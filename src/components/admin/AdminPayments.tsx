import { Activity, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Smartphone, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getHarakaPayBalance } from "@/lib/harakapay.functions";
import { formatTsh } from "@/lib/aviator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NETWORKS } from "@/lib/deposit";
import { Field, GhostButton, Panel, PrimaryButton, StatCard } from "./shared";

type NetworkAgg = { network: string; deposit_count: number; deposit_total: number; withdrawal_count: number; withdrawal_total: number; pending: number };

const NETWORK_THEME: Record<string, { ring: string; text: string; chip: string; dot: string }> = {
  mpesa: { ring: "ring-mpesa/40", text: "text-mpesa", chip: "bg-mpesa/15 text-mpesa", dot: "bg-mpesa" },
  tigo: { ring: "ring-tigo/40", text: "text-tigo", chip: "bg-tigo/15 text-tigo", dot: "bg-tigo" },
  airtel: { ring: "ring-airtel/40", text: "text-airtel", chip: "bg-airtel/15 text-airtel", dot: "bg-airtel" },
  halopesa: { ring: "ring-halopesa/40", text: "text-halopesa", chip: "bg-halopesa/15 text-halopesa", dot: "bg-halopesa" },
};

export function AdminPayments() {
  const [nums, setNums] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const balanceFn = useServerFn(getHarakaPayBalance);
  const [haraka, setHaraka] = useState<{ wallet: number; float: number } | string | null>(null);
  const [agg, setAgg] = useState<NetworkAgg[]>([]);
  const [totals, setTotals] = useState<{ depTotal: number; witTotal: number; depCount: number; witCount: number; pendingDep: number; pendingWit: number } | null>(null);
  const [econ, setEcon] = useState<{ total_completed: number; total_fees: number; net_profit: number; completed_count: number; harakapay_count: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshHaraka = () => {
    void balanceFn()
      .then((r) => setHaraka(r.ok ? { wallet: r.wallet, float: r.float } : r.error))
      .catch(() => setHaraka("Couldn't reach HarakaPay"));
  };

  useEffect(() => { refreshHaraka(); }, [balanceFn]);

  useEffect(() => {
    void supabase.from("game_settings").select("payment_numbers").eq("id", 1).maybeSingle().then(({ data }) => {
      setNums((data?.payment_numbers as Record<string, string>) ?? {});
    });
  }, []);

  const loadAgg = async () => {
    const [{ data: deps }, { data: wits }, { data: econData }] = await Promise.all([
      supabase.from("deposit_requests").select("network, amount, status"),
      supabase.from("withdrawal_requests").select("network, amount, status"),
      supabase.rpc("admin_deposit_economics"),
    ]);
    if (econData) setEcon(econData as { total_completed: number; total_fees: number; net_profit: number; completed_count: number; harakapay_count: number });
    const map: Record<string, NetworkAgg> = {};
    for (const n of NETWORKS) map[n.id] = { network: n.id, deposit_count: 0, deposit_total: 0, withdrawal_count: 0, withdrawal_total: 0, pending: 0 };
    for (const d of deps ?? []) {
      const r = map[d.network] ?? (map[d.network] = { network: d.network, deposit_count: 0, deposit_total: 0, withdrawal_count: 0, withdrawal_total: 0, pending: 0 });
      r.deposit_count += 1;
      r.deposit_total += Number(d.amount);
      if (d.status === "pending") r.pending += 1;
    }
    for (const w of wits ?? []) {
      const r = map[w.network] ?? (map[w.network] = { network: w.network, deposit_count: 0, deposit_total: 0, withdrawal_count: 0, withdrawal_total: 0, pending: 0 });
      r.withdrawal_count += 1;
      r.withdrawal_total += Number(w.amount);
    }
    setAgg(Object.values(map));
    const approvedDeps = (deps ?? []).filter((d) => d.status === "approved");
    const approvedWits = (wits ?? []).filter((w) => w.status === "paid");
    setTotals({
      depTotal: approvedDeps.reduce((s, d) => s + Number(d.amount), 0),
      witTotal: approvedWits.reduce((s, w) => s + Number(w.amount), 0),
      depCount: approvedDeps.length,
      witCount: approvedWits.length,
      pendingDep: (deps ?? []).filter((d) => d.status === "pending").length,
      pendingWit: (wits ?? []).filter((w) => w.status === "pending").length,
    });
  };

  useEffect(() => { void loadAgg(); }, []);

  const harakaOk = haraka !== null && typeof haraka === "object";

  const refreshAll = async () => {
    setRefreshing(true);
    refreshHaraka();
    await loadAgg();
    setRefreshing(false);
  };

  async function save() {
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(nums).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const { error } = await supabase.from("game_settings").update({ payment_numbers: clean }).eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Payment numbers saved.");
      void supabase.rpc("log_admin_action", { _target: null as unknown as string, _action: "save_payment_numbers", _details: { numbers: clean } as unknown as never }).then(() => {});
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Payment overview"
        description="Money in and out across every network, plus your HarakaPay wallet health."
        actions={
          <GhostButton onClick={() => void refreshAll()} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Deposits (approved)" value={totals ? formatTsh(totals.depTotal) : "…"} tone="good" />
          <StatCard label="Withdrawals (paid)" value={totals ? formatTsh(totals.witTotal) : "…"} tone="bad" />
          <StatCard label="Pending deposits" value={String(totals?.pendingDep ?? "…")} />
          <StatCard label="Pending withdrawals" value={String(totals?.pendingWit ?? "…")} />
        </div>
      </Panel>

      <Panel
        title="Deposit economics"
        description="Your real revenue after HarakaPay processing fees are deducted from completed deposits."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StatCard label="Completed deposits" value={econ ? formatTsh(econ.total_completed) : "…"} tone="good" />
          <StatCard label="HarakaPay fees" value={econ ? formatTsh(econ.total_fees) : "…"} tone="bad" />
          <StatCard label="Net profit after fees" value={econ ? formatTsh(econ.net_profit) : "…"} tone="good" />
        </div>
        {econ && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-tier-low/30 bg-tier-low/10 px-3 py-2">
            <TrendingUp className="size-4 text-tier-low" />
            <span className="text-xs font-semibold text-tier-low">
              {econ.harakapay_count} of {econ.completed_count} deposits processed via HarakaPay
            </span>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="HarakaPay wallet" description="Live balance from your HarakaPay account. Player deposits are added to their balance automatically once paid.">
          {haraka === null ? (
            <p className="text-sm text-muted-foreground">Loading HarakaPay balance…</p>
          ) : typeof haraka === "string" ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <Activity className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-bold text-destructive">HarakaPay unavailable</p>
                <p className="text-xs text-muted-foreground">{haraka}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="admin-glass rounded-xl p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="size-3.5" /> Wallet balance</p>
                  <p className="font-display text-xl font-bold tabular-nums text-gold">{formatTsh(haraka.wallet)}</p>
                </div>
                <div className="admin-glass rounded-xl p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Smartphone className="size-3.5" /> Float balance</p>
                  <p className="font-display text-xl font-bold tabular-nums text-foreground">{formatTsh(haraka.float)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-tier-low/30 bg-tier-low/10 px-3 py-2">
                <span className="size-2 animate-pulse rounded-full bg-tier-low" />
                <span className="text-xs font-semibold text-tier-low">Connected — automatic deposits are active.</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Network breakdown" description="Total deposits and withdrawals per mobile money network.">
          <ul className="space-y-2">
            {NETWORKS.map((n) => {
              const a = agg.find((x) => x.network === n.id);
              const theme = NETWORK_THEME[n.id] ?? NETWORK_THEME.mpesa;
              return (
                <li key={n.id} className={`admin-glass glass-hover rounded-xl p-3 ring-1 ${theme.ring}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${theme.dot}`} />
                      <span className={`font-display text-sm font-extrabold ${theme.text}`}>{n.label}</span>
                      {a && a.pending > 0 && (
                        <span className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase ${theme.chip}`}>{a.pending} waiting</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <ArrowDownToLine className="size-3.5 text-tier-low" />
                      <div>
                        <p className="text-muted-foreground">{a?.deposit_count ?? 0} deposits</p>
                        <p className="font-bold tabular-nums text-foreground">{formatTsh(a?.deposit_total ?? 0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ArrowUpFromLine className="size-3.5 text-destructive" />
                      <div>
                        <p className="text-muted-foreground">{a?.withdrawal_count ?? 0} withdrawals</p>
                        <p className="font-bold tabular-nums text-foreground">{formatTsh(a?.withdrawal_total ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Backup payment numbers" description="Optional fallback numbers for manual payments. Deposits go through HarakaPay, so these are no longer shown to players.">
        <div className="grid gap-3 sm:grid-cols-2">
          {NETWORKS.map((n) => (
            <Field key={n.id} label={n.label} hint="Leave empty to hide">
              <input className="auth-input" placeholder="e.g. Lipa Namba 123456 — OMUH 360" value={nums[n.id] ?? ""} onChange={(e) => setNums({ ...nums, [n.id]: e.target.value })} maxLength={80} />
            </Field>
          ))}
        </div>
        <PrimaryButton className="mt-4" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save numbers"}</PrimaryButton>
      </Panel>
    </div>
  );
}
