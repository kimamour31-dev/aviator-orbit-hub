import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getHarakaPayBalance } from "@/lib/harakapay.functions";
import { formatTsh } from "@/lib/aviator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NETWORKS } from "@/lib/deposit";
import { Field, Panel, PrimaryButton } from "./shared";

export function AdminPayments() {
  const [nums, setNums] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const balanceFn = useServerFn(getHarakaPayBalance);
  const [haraka, setHaraka] = useState<{ wallet: number; float: number } | string | null>(null);

  useEffect(() => {
    void balanceFn()
      .then((r) => setHaraka(r.ok ? { wallet: r.wallet, float: r.float } : r.error))
      .catch(() => setHaraka("Couldn't reach HarakaPay"));
  }, [balanceFn]);

  useEffect(() => {
    void supabase.from("game_settings").select("payment_numbers").eq("id", 1).maybeSingle().then(({ data }) => {
      setNums((data?.payment_numbers as Record<string, string>) ?? {});
    });
  }, []);

  async function save() {
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(nums).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const { error } = await supabase.from("game_settings").update({ payment_numbers: clean }).eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Payment numbers saved. Players now see them in the deposit window.");
  }

  return (
    <div className="space-y-4">
    <Panel title="HarakaPay" description="Player deposits send a PIN prompt through HarakaPay and are added to their balance automatically once paid.">
      {haraka === null ? (
        <p className="text-sm text-muted-foreground">Loading HarakaPay balance…</p>
      ) : typeof haraka === "string" ? (
        <p className="text-sm text-destructive">{haraka}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Wallet balance</p>
            <p className="font-display text-xl font-bold tabular-nums text-gold">{formatTsh(haraka.wallet)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Float balance</p>
            <p className="font-display text-xl font-bold tabular-nums text-foreground">{formatTsh(haraka.float)}</p>
          </div>
        </div>
      )}
    </Panel>
    <Panel title="Payment numbers" description="Optional backup numbers for manual payments. Deposits now go through HarakaPay, so these are no longer shown to players.">
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
