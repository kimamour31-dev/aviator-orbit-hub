import { Activity as ActivityIcon, Filter, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMult, formatTsh } from "@/lib/aviator";
import { formatPhone } from "@/lib/phone";
import { GhostButton, Panel, StatCard } from "./shared";

type EventRow = {
  id: string;
  user_id: string | null;
  actor_id: string | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user_phone: string | null;
  user_name: string | null;
  actor_phone: string | null;
  actor_name: string | null;
};

type Summary = {
  total: number;
  last_24h: number;
  last_7d: number;
  last_30d: number;
  by_type_24h: Record<string, number>;
  by_type_7d: Record<string, number>;
  active_players_24h: number;
  audit_total: number;
};

const EVENT_META: Record<string, { label: string; tone: string }> = {
  sign_up: { label: "Signed up", tone: "bg-tier-low/15 text-tier-low" },
  sign_in: { label: "Signed in", tone: "bg-primary/15 text-primary" },
  bet_placed: { label: "Bet placed", tone: "bg-bet/15 text-bet" },
  bet_cashed_out: { label: "Cashed out", tone: "bg-tier-low/15 text-tier-low" },
  bet_lost: { label: "Lost bet", tone: "bg-destructive/15 text-destructive" },
  deposit_requested: { label: "Deposit requested", tone: "bg-gold/15 text-gold" },
  deposit_approved: { label: "Deposit approved", tone: "bg-tier-low/15 text-tier-low" },
  deposit_rejected: { label: "Deposit rejected", tone: "bg-destructive/15 text-destructive" },
  withdrawal_requested: { label: "Withdrawal requested", tone: "bg-gold/15 text-gold" },
  withdrawal_paid: { label: "Withdrawal paid", tone: "bg-tier-low/15 text-tier-low" },
  withdrawal_rejected: { label: "Withdrawal rejected", tone: "bg-destructive/15 text-destructive" },
  balance_adjusted: { label: "Balance adjusted", tone: "bg-primary/15 text-primary" },
  promo_redeemed: { label: "Promo redeemed", tone: "bg-gold/15 text-gold" },
};

const EVENT_TYPES = Object.keys(EVENT_META);
const PAGE_SIZE = 50;

function describe(type: string, meta: Record<string, unknown>): string {
  const num = (k: string) => Number(meta[k] ?? 0);
  switch (type) {
    case "sign_up":
      return `New account${meta.phone ? ` · ${String(meta.phone)}` : ""}`;
    case "sign_in":
      return "Signed back in";
    case "bet_placed":
      return `Staked ${formatTsh(num("total"))} (slot 1: ${formatTsh(num("stake1"))}, slot 2: ${formatTsh(num("stake2"))})`;
    case "bet_cashed_out":
      return `Won ${formatTsh(num("payout"))} at ${formatMult(Number(meta.multiplier ?? 1))}${meta.auto ? " · auto" : ""}`;
    case "bet_lost":
      return `Lost ${formatTsh(num("stake"))} · crashed at ${formatMult(Number(meta.crash_point ?? 1))}`;
    case "deposit_requested":
    case "deposit_approved":
    case "deposit_rejected":
      return `${String(meta.network ?? "")} · ${formatTsh(num("amount"))}${meta.provider === "harakapay" ? " · HarakaPay" : ""}`;
    case "withdrawal_requested":
    case "withdrawal_paid":
    case "withdrawal_rejected":
      return `${String(meta.network ?? "")} · ${formatTsh(num("amount"))}`;
    case "balance_adjusted":
      return `${num("amount") >= 0 ? "+" : ""}${formatTsh(num("amount"))}${meta.note ? ` · ${String(meta.note)}` : ""}`;
    case "promo_redeemed":
      return `Code ${String(meta.code ?? "")} · bonus ${formatTsh(num("bonus"))}`;
    default:
      return "";
  }
}

function actorLabel(row: EventRow): string {
  if (row.actor_id && row.actor_id === row.user_id) return "self";
  if (row.actor_id) return row.actor_name || (row.actor_phone ? formatPhone(row.actor_phone) : "admin");
  if (row.actor_id === null && ["deposit_approved", "deposit_rejected"].includes(row.event_type)) return "HarakaPay";
  return "—";
}

export function AdminActivity() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [type, setType] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: sum }] = await Promise.all([
      supabase.rpc("admin_recent_events", { _limit: PAGE_SIZE, _offset: offset, _type: type, _user_id: null }),
      supabase.rpc("admin_event_summary"),
    ]);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as EventRow[]);
    setSummary(sum as unknown as Summary);
  }, [offset, type]);

  useEffect(() => { void load(); }, [load]);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.user_phone ?? "").includes(q.replace(/\D/g, "")) ||
        (r.user_name ?? "").toLowerCase().includes(q) ||
        r.event_type.toLowerCase().includes(q),
    );
  })();

  const byType = summary?.by_type_24h ?? {};
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-4">
      <Panel
        title="Activity overview"
        description="Every player interaction on the site, tracked automatically."
        actions={
          <GhostButton onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Events (24h)" value={String(summary?.last_24h ?? "…")} />
          <StatCard label="Events (7d)" value={String(summary?.last_7d ?? "…")} />
          <StatCard label="Active players (24h)" value={String(summary?.active_players_24h ?? "…")} />
          <StatCard label="Total events" value={String(summary?.total ?? "…")} />
        </div>
        {topTypes.length > 0 && (
          <>
            <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Top actions in last 24h</h3>
            <div className="flex flex-wrap gap-1.5">
              {topTypes.map(([t, n]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
                  <ActivityIcon className="size-3 text-muted-foreground" />
                  {EVENT_META[t]?.label ?? t} <span className="tabular-nums text-muted-foreground">{n}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Activity feed"
        description="The latest player actions across the site, newest first."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search player or event"
                className="auth-input h-8 w-40 pl-8 text-xs"
              />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setOffset(0); }}
                className="auth-input h-8 w-44 pl-8 text-xs"
              >
                <option value="">All events</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_META[t].label}</option>
                ))}
              </select>
            </div>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No events yet."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const meta = EVENT_META[r.event_type] ?? { label: r.event_type, tone: "bg-muted text-muted-foreground" };
              return (
                <li key={r.id} className="flex items-start gap-3 py-2.5">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {r.user_name || (r.user_phone ? formatPhone(r.user_phone) : "Unknown player")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{describe(r.event_type, r.metadata) || "—"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-medium text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">by {actorLabel(r)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between">
          <GhostButton disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Newer</GhostButton>
          <span className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + filtered.length}</span>
          <GhostButton disabled={filtered.length < PAGE_SIZE} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Older</GhostButton>
        </div>
      </Panel>
    </div>
  );
}
