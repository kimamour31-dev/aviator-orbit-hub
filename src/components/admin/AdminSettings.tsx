import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseHouseEdgePercent } from "@/lib/admin-rules";
import { Field, Panel, PrimaryButton, Toggle, toInt } from "./shared";

type Form = { edge: string; minBet: string; maxBet: string; maxMult: string; maxPayout: string; enabled: boolean };

export function AdminSettings() {
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("game_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
      if (data)
        setForm({
          edge: String(Math.round(Number(data.house_edge) * 10000) / 100),
          minBet: String(data.min_bet),
          maxBet: String(data.max_bet),
          maxMult: String(data.max_multiplier),
          maxPayout: String(data.max_payout),
          enabled: data.real_mode_enabled,
        });
    });
  }, []);

  if (!form) return <Panel title="Game settings"><p className="text-sm text-muted-foreground">Loading…</p></Panel>;
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });

  const save = async () => {
    const edge = parseHouseEdgePercent(form.edge);
    const minBet = toInt(form.minBet);
    const maxBet = toInt(form.maxBet);
    const maxMult = Number(form.maxMult);
    const maxPayout = toInt(form.maxPayout);
    if (edge === null) { toast.error("House edge must be between 0% and 50%"); return; }
    if (!minBet || minBet < 1) { toast.error("Minimum bet must be at least 1 TSh"); return; }
    if (!maxBet || maxBet < minBet) { toast.error("Maximum bet must be at least the minimum bet"); return; }
    if (!Number.isFinite(maxMult) || maxMult < 1.01) { toast.error("Highest multiplier must be at least 1.01x"); return; }
    if (!maxPayout || maxPayout < 1) { toast.error("Biggest payout must be above 0"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("game_settings")
      .update({ house_edge: edge, min_bet: minBet, max_bet: maxBet, max_multiplier: maxMult, max_payout: maxPayout, real_mode_enabled: form.enabled, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  };

  return (
    <Panel title="Game settings" description="Apply to every Real-mode round. A player's own risk settings override the house edge and maximum bet.">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-background p-3">
        <div>
          <p className="text-sm font-bold text-foreground">Real mode open</p>
          <p className="text-xs text-muted-foreground">Turn off to stop all Real-mode betting right away.</p>
        </div>
        <Toggle checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Real mode open" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="House edge (%)" hint="Your average share of every bet. 3% means players get back about 97% over time.">
          <input className="auth-input" inputMode="decimal" value={form.edge} onChange={(e) => set({ edge: e.target.value })} />
        </Field>
        <Field label="Highest multiplier (x)" hint="The plane never flies higher than this.">
          <input className="auth-input" inputMode="decimal" value={form.maxMult} onChange={(e) => set({ maxMult: e.target.value })} />
        </Field>
        <Field label="Minimum bet (TSh)">
          <input className="auth-input" inputMode="numeric" value={form.minBet} onChange={(e) => set({ minBet: e.target.value })} />
        </Field>
        <Field label="Maximum bet (TSh)">
          <input className="auth-input" inputMode="numeric" value={form.maxBet} onChange={(e) => set({ maxBet: e.target.value })} />
        </Field>
        <Field label="Biggest single payout (TSh)" hint="A winning bet never pays more than this.">
          <input className="auth-input" inputMode="numeric" value={form.maxPayout} onChange={(e) => set({ maxPayout: e.target.value })} />
        </Field>
      </div>
      <PrimaryButton className="mt-4" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</PrimaryButton>
    </Panel>
  );
}
