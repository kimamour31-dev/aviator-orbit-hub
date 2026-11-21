import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatTsh } from "@/lib/aviator";
import { formatPhone } from "@/lib/phone";
import { GhostButton, Panel } from "./shared";

type AuditRow = {
  id: string;
  admin_id: string | null;
  target_user_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  admin_phone: string | null;
  admin_name: string | null;
  target_phone: string | null;
  target_name: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  review_deposit: "Reviewed deposit",
  review_withdrawal: "Reviewed withdrawal",
  adjust_balance: "Adjusted balance",
  update_settings: "Updated game settings",
  save_risk: "Saved player risk",
  save_promo: "Saved promo code",
  save_odds_rule: "Saved time cap",
};

const PAGE_SIZE = 50;

function describe(action: string, d: Record<string, unknown>): string {
  const num = (k: string) => Number(d[k] ?? 0);
  const bool = (k: string) => Boolean(d[k]);
  switch (action) {
    case "review_deposit":
      return `${bool("approved") ? "Approved" : "Rejected"} ${String(d.network ?? "")} deposit of ${formatTsh(num("amount"))}${d.note ? ` · ${String(d.note)}` : ""}`;
    case "review_withdrawal":
      return `${bool("paid") ? "Paid" : "Rejected"} ${String(d.network ?? "")} withdrawal of ${formatTsh(num("amount"))}${d.reference ? ` · ref ${String(d.reference)}` : ""}`;
    case "adjust_balance":
      return `${num("amount") >= 0 ? "Added" : "Removed"} ${formatTsh(Math.abs(num("amount")))} · new balance ${formatTsh(num("new_balance"))}${d.note ? ` · ${String(d.note)}` : ""}`;
    default:
      return JSON.stringify(d);
  }
}

export function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_recent_audit", { _limit: PAGE_SIZE, _offset: offset });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as AuditRow[]);
  }, [offset]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Panel
      title="Admin audit log"
      description="Every operator action is recorded here permanently — deposits reviewed, balances adjusted, settings saved."
      actions={
        <GhostButton onClick={() => void load()} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </GhostButton>
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No admin actions recorded yet."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <span className="mt-0.5 shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                {ACTION_LABELS[r.action] ?? r.action}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {r.admin_name || (r.admin_phone ? formatPhone(r.admin_phone) : "Admin")}
                  {r.target_user_id && (
                    <span className="font-normal text-muted-foreground">
                      {" → "}
                      {r.target_name || (r.target_phone ? formatPhone(r.target_phone) : "player")}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{describe(r.action, r.details) || "—"}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between">
        <GhostButton disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Newer</GhostButton>
        <span className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + rows.length}</span>
        <GhostButton disabled={rows.length < PAGE_SIZE} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Older</GhostButton>
      </div>
    </Panel>
  );
}
