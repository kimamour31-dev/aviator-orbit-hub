import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { StatusBadge } from "@/components/aviator/DepositDialog";
import { formatTsh } from "@/lib/aviator";
import { NETWORKS } from "@/lib/deposit";
import { formatPhone } from "@/lib/phone";
import { GhostButton, Panel, PrimaryButton } from "./shared";

type Deposit = Tables<"deposit_requests">;

export function AdminDeposits() {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<Deposit[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from("deposit_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    setRows(data ?? []);
    const ids = [...new Set((data ?? []).map((d) => d.user_id))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, phone").in("id", ids);
      setAccounts(Object.fromEntries((p ?? []).map((x) => [x.id, x.phone])));
    }
  }, [filter]);
  useEffect(() => void load(), [load]);

  async function review(id: string, approve: boolean) {
    setBusy(id);
    const { error } = await supabase.rpc("review_deposit", { _id: id, _approve: approve, _note: notes[id] ?? "" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "Deposit approved and added to the player's balance." : "Deposit declined.");
    void load();
  }

  return (
    <Panel
      title="Deposits"
      description="Check that the mobile money payment arrived, then approve to add it to the player's balance."
      actions={
        <div className="flex gap-1.5">
          <GhostButton onClick={() => setFilter("pending")} className={filter === "pending" ? "bg-muted" : ""}>Waiting</GhostButton>
          <GhostButton onClick={() => setFilter("all")} className={filter === "all" ? "bg-muted" : ""}>All</GhostButton>
        </div>
      }
    >
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No deposits {filter === "pending" ? "waiting" : "yet"}.</p>}
      <div className="space-y-2">
        {rows.map((d) => (
          <div key={d.id} className="rounded-xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-base font-bold tabular-nums text-foreground">{formatTsh(Number(d.amount))}</p>
                <p className="text-xs text-muted-foreground">
                  {NETWORKS.find((n) => n.id === d.network)?.label} from {formatPhone(d.phone)} · account{" "}
                  {accounts[d.user_id] ? formatPhone(accounts[d.user_id]) : "—"} · {new Date(d.created_at).toLocaleString()}
                </p>
                {d.admin_note && <p className="mt-1 text-xs text-muted-foreground">Note: {d.admin_note}</p>}
              </div>
              <StatusBadge status={d.status} />
            </div>
            {d.status === "pending" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={notes[d.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                  placeholder="Note, e.g. transaction ID (optional)"
                  maxLength={200}
                  className="auth-input min-w-0 flex-1 py-1.5 text-sm"
                />
                <PrimaryButton disabled={busy === d.id} onClick={() => void review(d.id, true)}>Approve</PrimaryButton>
                <GhostButton disabled={busy === d.id} onClick={() => void review(d.id, false)} className="py-2">Decline</GhostButton>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
