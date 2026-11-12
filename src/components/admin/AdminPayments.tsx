import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NETWORKS } from "@/lib/deposit";
import { Field, Panel, PrimaryButton } from "./shared";

export function AdminPayments() {
  const [nums, setNums] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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
    <Panel title="Payment numbers" description="The number, till or Lipa Namba players should send money to. Shown in the deposit window when they pick a network.">
      <div className="grid gap-3 sm:grid-cols-2">
        {NETWORKS.map((n) => (
          <Field key={n.id} label={n.label} hint="Leave empty to hide">
            <input className="auth-input" placeholder="e.g. Lipa Namba 123456 — OMUH 360" value={nums[n.id] ?? ""} onChange={(e) => setNums({ ...nums, [n.id]: e.target.value })} maxLength={80} />
          </Field>
        ))}
      </div>
      <PrimaryButton className="mt-4" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save numbers"}</PrimaryButton>
    </Panel>
  );
}
