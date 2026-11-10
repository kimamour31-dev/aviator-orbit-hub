import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { normalizePromoCode } from "@/lib/admin-rules";
import { formatTsh } from "@/lib/aviator";
import { Field, GhostButton, Panel, PrimaryButton, Toggle, toInt } from "./shared";

export function AdminPromoCodes() {
  const [codes, setCodes] = useState<Tables<"promo_codes">[]>([]);
  const [code, setCode] = useState("");
  const [bonus, setBonus] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    setCodes(data ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  const add = async () => {
    const c = normalizePromoCode(code);
    if (!c) return toast.error("Use 2–30 letters, numbers, - or _");
    const b = toInt(bonus) ?? 0;
    if (b < 0) return toast.error("Bonus can't be negative");
    const mu = maxUses.trim() === "" ? null : toInt(maxUses);
    if (maxUses.trim() !== "" && (!mu || mu < 1)) return toast.error("Max uses must be 1 or more, or empty for unlimited");
    setBusy(true);
    const { error } = await supabase.from("promo_codes").insert({ code: c, bonus: b, max_uses: mu, note: note.trim() || null });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "That code already exists" : error.message);
    toast.success(`Promo code ${c} created`);
    setCode("");
    setNote("");
    void load();
  };

  const toggle = async (c: Tables<"promo_codes">, active: boolean) => {
    setCodes((cs) => cs.map((x) => (x.code === c.code ? { ...x, active } : x)));
    const { error } = await supabase.from("promo_codes").update({ active }).eq("code", c.code);
    if (error) { toast.error(error.message); void load(); }
  };

  const remove = async (c: Tables<"promo_codes">) => {
    if (!confirm(`Delete promo code ${c.code}? Players who already used it keep their bonus.`)) return;
    const { error } = await supabase.from("promo_codes").delete().eq("code", c.code);
    if (error) toast.error(error.message);
    else void load();
  };

  return (
    <div className="space-y-3">
      <Panel title="Promo codes" description="New players can enter a code when they register. A valid code is saved on their account and adds the bonus to their balance.">
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No promo codes yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {codes.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-3 py-2.5">
                <Toggle checked={c.active} onChange={(v) => void toggle(c, v)} label={`Turn ${c.code} on or off`} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold tracking-wide text-foreground">{c.code}</p>
                  <p className="text-xs text-muted-foreground">
                    Bonus {formatTsh(Number(c.bonus))} · used {c.uses}
                    {c.max_uses ? ` of ${c.max_uses}` : " (no limit)"}
                    {c.note && ` · ${c.note}`}
                  </p>
                </div>
                <GhostButton aria-label={`Delete ${c.code}`} onClick={() => void remove(c)}>
                  <Trash2 className="size-3.5" />
                </GhostButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Create a promo code">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input className="auth-input uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME" maxLength={30} />
          </Field>
          <Field label="Sign-up bonus (TSh)">
            <input className="auth-input" inputMode="numeric" value={bonus} onChange={(e) => setBonus(e.target.value)} />
          </Field>
          <Field label="Max uses" hint="Empty = no limit">
            <input className="auth-input" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </Field>
          <Field label="Note" hint="e.g. agent name">
            <input className="auth-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} />
          </Field>
        </div>
        <PrimaryButton className="mt-4" disabled={busy} onClick={add}>Create code</PrimaryButton>
      </Panel>
    </div>
  );
}
