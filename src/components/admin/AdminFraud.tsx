import { CheckCircle2, Flag, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/lib/phone";
import { GhostButton, Panel, StatCard } from "./shared";

type FlagRow = {
  id: string;
  user_id: string | null;
  flag_type: string;
  severity: string;
  details: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  phone: string | null;
  display_name: string | null;
};

const SEVERITY_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-gold/15 text-gold",
  high: "bg-destructive/15 text-destructive",
};

const FLAG_LABELS: Record<string, string> = {
  abnormal_win: "Abnormal win rate",
  manual_deposit: "Non-HarakaPay deposit",
};

export function AdminFraud() {
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_fraud_flags", { _resolved: showResolved });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as FlagRow[]);
  }, [showResolved]);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (id: string, resolved: boolean) => {
    setBusy(id);
    const { error } = await supabase.rpc("admin_resolve_flag", { _id: id, _resolved: resolved });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(resolved ? "Flag marked as resolved" : "Flag reopened");
    void load();
  };

  const open = rows.filter((r) => !r.resolved);
  const high = open.filter((r) => r.severity === "high");

  return (
    <div className="space-y-4">
      <Panel
        title="Fraud & risk alerts"
        description="Automatically raised when a player's behaviour looks abnormal — for example, a win rate above 80% over 10+ settled bets."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-bold">
              <button onClick={() => setShowResolved(false)} className={`rounded-full px-3 py-1 ${!showResolved ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Open</button>
              <button onClick={() => setShowResolved(true)} className={`rounded-full px-3 py-1 ${showResolved ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Resolved</button>
            </div>
            <GhostButton onClick={() => void load()} className="gap-1.5">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </GhostButton>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Open alerts" value={String(open.length)} tone={open.length > 0 ? "bad" : undefined} />
          <StatCard label="High severity" value={String(high.length)} tone={high.length > 0 ? "bad" : undefined} />
          <StatCard label="Total shown" value={String(rows.length)} />
          <StatCard label="View" value={showResolved ? "Resolved" : "Open"} />
        </div>
      </Panel>

      <Panel title={showResolved ? "Resolved alerts" : "Active alerts"} description="Newest first. Resolve an alert once you've reviewed the player's activity.">
        {rows.length === 0 ? (
          <div className="py-8 text-center">
            <ShieldAlert className="mx-auto mb-2 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{loading ? "Loading…" : showResolved ? "No resolved alerts." : "No active fraud alerts. Everything looks clean."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <Flag className={`mt-0.5 size-4 shrink-0 ${r.severity === "high" ? "text-destructive" : r.severity === "medium" ? "text-gold" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      {r.display_name || (r.phone ? formatPhone(r.phone) : "Unknown player")}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_TONE[r.severity] ?? SEVERITY_TONE.medium}`}>
                      {r.severity}
                    </span>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      {FLAG_LABELS[r.flag_type] ?? r.flag_type}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {Object.entries(r.details).map(([k, v]) => `${k}: ${typeof v === "number" ? (k === "rate" ? `${(Number(v) * 100).toFixed(0)}%` : String(v)) : String(v)}`).join(" · ")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Raised {new Date(r.created_at).toLocaleString()}
                    {r.resolved && r.resolved_at && ` · resolved ${new Date(r.resolved_at).toLocaleString()}`}
                  </p>
                </div>
                {r.resolved ? (
                  <GhostButton disabled={busy === r.id} onClick={() => void resolve(r.id, false)} className="gap-1.5">
                    Reopen
                  </GhostButton>
                ) : (
                  <GhostButton disabled={busy === r.id} onClick={() => void resolve(r.id, true)} className="gap-1.5">
                    <CheckCircle2 className="size-3.5" /> Resolve
                  </GhostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
