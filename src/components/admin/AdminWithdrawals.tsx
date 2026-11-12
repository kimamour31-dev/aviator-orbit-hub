import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { StatusBadge } from "@/components/aviator/DepositDialog";
import { formatTsh } from "@/lib/aviator";
import { NETWORKS } from "@/lib/deposit";
import { formatPhone } from "@/lib/phone";
import { GhostButton, Panel, PrimaryButton } from "./shared";

type Withdrawal = Tables<"withdrawal_requests">;

export function AdminWithdrawals() {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    setRows(data ?? []);
    const ids = [...new Set((data ?? []).map((d) => d.user_id))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, phone").in("id", ids);
      setAccounts(Object.fromEntries((p ?? []).map((x) => [x.id, x.phone])));
    }
  }, [filter]);
  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, paid: boolean) {
    setBusy(id);
    const { error } = await supabase.rpc("review_withdrawal", { _id: id, _paid: paid, _reference: refs[id] ?? "", _note: "" });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(paid ? "Marked as paid." : "Declined — the amount went back to the player's balance.");
    void load();
  }

  return (
    <Panel
      title="Withdrawals"
      description="Send the money by mobile money, enter the transaction reference, then mark it paid. Declining returns the amount to the player."
      actions={
        <div className="flex gap-1">
          <GhostButton onClick={() => setFilter("pending")} className={filter === "pending" ? "border-gold text-gold" : ""}>Waiting</GhostButton>
          <GhostButton onClick={() => setFilter("all")} className={filter === "all" ? "border-gold text-gold" : ""}>All</GhostButton>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No withdrawals {filter === "pending" ? "waiting" : "yet"}.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((w) => (
            <div key={w.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-bold tabular-nums text-foreground">{formatTsh(Number(w.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    Pay to <span className="font-bold text-foreground">{formatPhone(w.phone)}</span> ({NETWORKS.find((n) => n.id === w.network)?.label}) · account{" "}
                    {formatPhone(accounts[w.user_id] ?? "") || "…"} · {new Date(w.created_at).toLocaleString()}
                  </p>
                  {w.reference && <p className="text-xs text-muted-foreground">Ref: {w.reference}</p>}
                </div>
                <StatusBadge status={w.status} />
              </div>
              {w.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="auth-input min-w-40 flex-1"
                    placeholder="Transaction reference (optional)"
                    value={refs[w.id] ?? ""}
                    onChange={(e) => setRefs({ ...refs, [w.id]: e.target.value })}
                  />
                  <PrimaryButton disabled={busy === w.id} onClick={() => void review(w.id, true)}>Mark paid</PrimaryButton>
                  <GhostButton disabled={busy === w.id} onClick={() => void review(w.id, false)}>Decline</GhostButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
