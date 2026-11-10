import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { parseHouseEdgePercent } from "@/lib/admin-rules";
import { formatTsh } from "@/lib/aviator";
import { formatPhone } from "@/lib/phone";
import { Field, GhostButton, Panel, PrimaryButton, StatCard, Toggle, toInt } from "./shared";

type Profile = Tables<"profiles">;
type Risk = Tables<"user_risk">;

export function AdminPlayers() {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [risk, setRisk] = useState<Record<string, Risk>>({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("user_risk").select("*"),
    ]);
    setPlayers(p ?? []);
    setRisk(Object.fromEntries((r ?? []).map((x) => [x.user_id, x])));
  }, []);
  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const q = query.replace(/\D/g, "") || query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) => p.phone.includes(q.replace(/^0/, "")) || (p.display_name ?? "").toLowerCase().includes(query.trim().toLowerCase()) || (p.promo_code ?? "").toLowerCase().includes(query.trim().toLowerCase()),
    );
  }, [players, query]);

  return (
    <Panel title="Players" description="Search players, set their personal risk rate, block them, or add and remove balance.">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input className="auth-input pl-9" placeholder="Search by phone, name or promo code" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players found.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((p) => {
            const r = risk[p.id];
            const isOpen = open === p.id;
            return (
              <li key={p.id} className="py-2">
                <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(isOpen ? null : p.id)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {p.display_name || formatPhone(p.phone)}
                      {r?.blocked && <span className="ml-2 rounded bg-destructive px-1.5 py-px text-[10px] uppercase text-destructive-foreground">Blocked</span>}
                      {r && (r.house_edge !== null || r.max_bet !== null) && !r.blocked && (
                        <span className="ml-2 rounded bg-gold px-1.5 py-px text-[10px] uppercase text-background">Custom risk</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPhone(p.phone)} · joined {new Date(p.created_at).toLocaleDateString()}
                      {p.promo_code && ` · promo ${p.promo_code}`}
                    </p>
                  </div>
                  <span className="font-display text-sm font-bold tabular-nums text-foreground">{formatTsh(Number(p.balance))}</span>
                  {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                </button>
                {isOpen && <PlayerDetail player={p} risk={r} onChanged={load} />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function PlayerDetail({ player, risk, onChanged }: { player: Profile; risk: Risk | undefined; onChanged: () => Promise<void> }) {
  const [edge, setEdge] = useState(risk?.house_edge != null ? String(Math.round(Number(risk.house_edge) * 10000) / 100) : "");
  const [maxBet, setMaxBet] = useState(risk?.max_bet != null ? String(risk.max_bet) : "");
  const [blocked, setBlocked] = useState(risk?.blocked ?? false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ staked: number; paid: number; bets: number } | null>(null);
  const [adjustments, setAdjustments] = useState<Tables<"balance_adjustments">[]>([]);

  useEffect(() => {
    void supabase.from("real_bets").select("stake, payout, status").eq("user_id", player.id).neq("status", "active").limit(5000).then(({ data }) => {
      const rows = data ?? [];
      setSummary({ staked: rows.reduce((s, b) => s + Number(b.stake), 0), paid: rows.reduce((s, b) => s + Number(b.payout), 0), bets: rows.length });
    });
    void supabase.from("balance_adjustments").select("*").eq("user_id", player.id).order("created_at", { ascending: false }).limit(10).then(({ data }) => setAdjustments(data ?? []));
  }, [player.id]);

  const saveRisk = async () => {
    const e = edge.trim() === "" ? null : parseHouseEdgePercent(edge);
    if (edge.trim() !== "" && e === null) { toast.error("House edge must be between 0% and 50%"); return; }
    const mb = maxBet.trim() === "" ? null : toInt(maxBet);
    if (maxBet.trim() !== "" && (!mb || mb < 1)) { toast.error("Maximum bet must be above 0"); return; }
    setBusy(true);
    const { error } = await supabase.from("user_risk").upsert({ user_id: player.id, house_edge: e, max_bet: mb, blocked, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Player risk saved");
    void onChanged();
  };

  const adjust = async (sign: 1 | -1) => {
    const n = toInt(amount);
    if (!n || n <= 0) { toast.error("Enter an amount above 0"); return; }
    if (!note.trim()) { toast.error("Add a short note, e.g. 'M-Pesa deposit ref 123'"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_adjust_balance", { _user_id: player.id, _amount: sign * n, _note: note.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`New balance: ${formatTsh(Number(data))}`);
    setAmount("");
    setNote("");
    void onChanged();
    const { data: adj } = await supabase.from("balance_adjustments").select("*").eq("user_id", player.id).order("created_at", { ascending: false }).limit(10);
    setAdjustments(adj ?? []);
  };

  const houseResult = summary ? summary.staked - summary.paid : 0;

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-background p-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Bets" value={summary ? String(summary.bets) : "…"} />
        <StatCard label="Staked" value={summary ? formatTsh(summary.staked) : "…"} />
        <StatCard label="Your profit" value={summary ? formatTsh(houseResult) : "…"} tone={houseResult >= 0 ? "good" : "bad"} />
      </div>
      {player.promo_bonus > 0 && <p className="text-xs text-muted-foreground">Joined with promo {player.promo_code} · bonus {formatTsh(Number(player.promo_bonus))}</p>}

      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Risk rate</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Personal house edge (%)" hint="Leave empty to use the game setting.">
            <input className="auth-input" inputMode="decimal" value={edge} onChange={(e) => setEdge(e.target.value)} placeholder="Game default" />
          </Field>
          <Field label="Personal max bet (TSh)" hint="Leave empty to use the game setting.">
            <input className="auth-input" inputMode="numeric" value={maxBet} onChange={(e) => setMaxBet(e.target.value)} placeholder="Game default" />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Toggle checked={blocked} onChange={setBlocked} label="Block this player from betting" />
          <span className="text-sm text-foreground">Block from betting</span>
          <PrimaryButton className="ml-auto" disabled={busy} onClick={saveRisk}>Save risk</PrimaryButton>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Balance</h4>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Amount (TSh)">
            <input className="auth-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="auth-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Reason or payment reference" />
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <PrimaryButton disabled={busy} onClick={() => void adjust(1)}>Add balance</PrimaryButton>
          <GhostButton disabled={busy} onClick={() => void adjust(-1)} className="px-4 py-2 text-sm">Remove balance</GhostButton>
        </div>
        {adjustments.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {adjustments.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-muted-foreground">
                <span className="truncate">{new Date(a.created_at).toLocaleString()} · {a.note}</span>
                <span className={`font-bold tabular-nums ${a.amount >= 0 ? "text-tier-low" : "text-destructive"}`}>{a.amount >= 0 ? "+" : ""}{formatTsh(Number(a.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
