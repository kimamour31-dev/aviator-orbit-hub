import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ruleAppliesAtHour, tanzaniaHour } from "@/lib/admin-rules";
import { Field, GhostButton, Panel, PrimaryButton, Toggle, hourLabel } from "./shared";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function AdminOddsRules() {
  const [rules, setRules] = useState<Tables<"odds_rules">[]>([]);
  const [label, setLabel] = useState("Evening cap");
  const [start, setStart] = useState(18);
  const [end, setEnd] = useState(22);
  const [cap, setCap] = useState("5");
  const [busy, setBusy] = useState(false);
  const nowHour = tanzaniaHour();

  const load = useCallback(async () => {
    const { data } = await supabase.from("odds_rules").select("*").order("start_hour");
    setRules(data ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  const add = async () => {
    const m = Number(cap);
    if (!Number.isFinite(m) || m < 1) return toast.error("The cap must be 1x or higher");
    if (start === end) return toast.error("Start and end hour must be different");
    setBusy(true);
    const { error } = await supabase.from("odds_rules").insert({ label: label.trim() || "Rule", start_hour: start, end_hour: end === 0 ? 24 : end, max_multiplier: m });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Time cap added");
    void load();
  };

  const toggle = async (r: Tables<"odds_rules">, enabled: boolean) => {
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled } : x)));
    const { error } = await supabase.from("odds_rules").update({ enabled }).eq("id", r.id);
    if (error) { toast.error(error.message); void load(); }
  };

  const remove = async (r: Tables<"odds_rules">) => {
    if (!confirm(`Delete "${r.label}"?`)) return;
    const { error } = await supabase.from("odds_rules").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else void load();
  };

  return (
    <div className="space-y-3">
      <Panel title="Time-of-day caps" description={`Limit how high the plane can fly during certain hours (Tanzania time — now ${hourLabel(nowHour)}). If several caps cover the same hour, the lowest one wins.`}>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No caps yet. Add one below.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => {
              const live = r.enabled && ruleAppliesAtHour(r.start_hour, r.end_hour, nowHour);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Toggle checked={r.enabled} onChange={(v) => void toggle(r, v)} label={`Turn ${r.label} on or off`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">
                      {r.label} {live && <span className="ml-1 rounded bg-bet px-1.5 py-px text-[10px] uppercase text-bet-foreground">Active now</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hourLabel(r.start_hour)} – {hourLabel(r.end_hour)} · max {Number(r.max_multiplier)}x
                    </p>
                  </div>
                  <GhostButton aria-label={`Delete ${r.label}`} onClick={() => void remove(r)}>
                    <Trash2 className="size-3.5" />
                  </GhostButton>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Add a time cap">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name">
            <input className="auth-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
          </Field>
          <Field label="From">
            <select className="auth-input" value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
          <Field label="Until">
            <select className="auth-input" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
          <Field label="Max multiplier (x)">
            <input className="auth-input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
          </Field>
        </div>
        <PrimaryButton className="mt-4" disabled={busy} onClick={add}>Add cap</PrimaryButton>
      </Panel>
    </div>
  );
}
