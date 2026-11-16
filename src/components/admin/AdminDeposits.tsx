import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkHarakaPayDeposit } from "@/lib/harakapay.functions";
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
  const checkFn = useServerFn(checkHarakaPayDeposit);

  async function checkHaraka(id: string) {
    setBusy(id);
    const res = await checkFn({ data: { id } }).catch(() => null);
    setBusy(null);
    if (res?.status === "approved") toast.success("HarakaPay confirmed it — added to the player's balance.");
    else if (res?.status === "rejected") toast.error("HarakaPay says this payment failed.");
    else toast.message("HarakaPay hasn't confirmed this payment yet.");
    void load();
  }

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
  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, approve: boolean) {
    setBusy(id);
    const { error } = await supabase.rpc("review_deposit", { _id: id, _approve: approve, _note: notes[id] ?? "" });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approve ? "Deposit approved and added to the player's balance." : "Deposit declined.");
    void load();
  }

  return (
    <Panel
      title="Deposits"
      description="HarakaPay deposits are added to the player's balance automatically once paid. Manual deposits need your approval."
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
                <p className="font-display text-base font-bold tabular-nums text-foreground">
                  {formatTsh(Number(d.amount))}
                  <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide ${d.provider === "harakapay" ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground"}`}>
                    {d.provider === "harakapay" ? "HarakaPay" : "Manual"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {NETWORKS.find((n) => n.id === d.network)?.label} from {formatPhone(d.phone)} · account{" "}
                  {accounts[d.user_id] ? formatPhone(accounts[d.user_id] ?? "") : "—"} · {new Date(d.created_at).toLocaleString()}
                </p>
                {d.provider_order_id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Order {d.provider_order_id}
                    {d.provider_fee != null && ` · fee ${formatTsh(Number(d.provider_fee))} · you receive ${formatTsh(Number(d.provider_net ?? 0))}`}
                  </p>
                )}
                {d.admin_note && <p className="mt-1 text-xs text-muted-foreground">Note: {d.admin_note}</p>}
              </div>
              <StatusBadge status={d.status} />
            </div>
            {d.status === "pending" && d.provider === "harakapay" && (
              <div className="mt-3">
                <GhostButton disabled={busy === d.id} onClick={() => void checkHaraka(d.id)} className="py-2">
                  {busy === d.id ? "Checking…" : "Check with HarakaPay"}
                </GhostButton>
              </div>
            )}
            {d.status === "pending" && d.provider !== "harakapay" && (
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
