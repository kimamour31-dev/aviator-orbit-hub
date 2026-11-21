import { Cog, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMult } from "@/lib/aviator";
import { Field, GhostButton, Panel, PrimaryButton, StatCard } from "./shared";

type Formula = {
  growth_per_ms: number;
  instant_crash_prob: number;
  min_crash: number;
  max_crash: number;
  updated_at?: string;
};

type GameSettings = { house_edge: number; max_multiplier: number };

const PRESETS = [
  { label: "Slow & friendly", growth: 0.00006, instant: 0.02, min: 1.2, max: 500 },
  { label: "Default (balanced)", growth: 0.00008, instant: 0.03, min: 1.0, max: 1000 },
  { label: "Fast & spicy", growth: 0.00012, instant: 0.05, min: 1.0, max: 2000 },
  { label: "High roller ceiling", growth: 0.00009, instant: 0.03, min: 1.0, max: 10000 },
] as const;

/**
 * Pure-TS mirror of the server crash distribution so the operator can preview
 * the effect of their dials before saving. Server formula in start_real_round:
 *   with prob instant_crash_prob -> crash = min_crash
 *   else crash = (1 - house_edge) / (1 - r), clamped to [min_crash, max_crash]
 */
function sampleCrash(houseEdge: number, instant: number, min: number, max: number): number {
  const r = Math.random();
  if (Math.random() < instant) return min;
  let crash = Math.floor(((1 - houseEdge) / (1 - r)) * 100) / 100;
  if (crash < min) crash = min;
  if (crash > max) crash = max;
  return crash;
}

function distribution(houseEdge: number, instant: number, min: number, max: number, samples: number) {
  const buckets = [
    { label: "1.00–1.50x", min: 1, max: 1.5, count: 0 },
    { label: "1.50–2.00x", min: 1.5, max: 2, count: 0 },
    { label: "2.00–5.00x", min: 2, max: 5, count: 0 },
    { label: "5.00–10.00x", min: 5, max: 10, count: 0 },
    { label: "10.00–50.00x", min: 10, max: 50, count: 0 },
    { label: "50.00x+", min: 50, max: Infinity, count: 0 },
  ];
  let maxCrash = 0;
  let cashedUnder2 = 0;
  for (let i = 0; i < samples; i++) {
    const c = sampleCrash(houseEdge, instant, min, max);
    if (c > maxCrash) maxCrash = c;
    if (c < 2) cashedUnder2 += 1;
    for (const b of buckets) {
      if (c >= b.min && c < b.max) { b.count += 1; break; }
    }
  }
  return { buckets, maxCrash, cashedUnder2, samples };
}

export function AdminFormula() {
  const [form, setForm] = useState<Formula | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    void supabase.rpc("admin_get_formula").then(({ data, error }) => {
      if (error) { toast.error(error.message); return; }
      setForm(data as unknown as Formula);
    });
    void supabase.from("game_settings").select("house_edge, max_multiplier").eq("id", 1).maybeSingle().then(({ data }) => {
      if (data) setSettings({ house_edge: Number(data.house_edge), max_multiplier: Number(data.max_multiplier) });
    });
  }, []);

  const dist = useMemo(() => {
    if (!form || !settings) return null;
    return distribution(settings.house_edge, form.instant_crash_prob, Number(form.min_crash), Math.min(Number(form.max_crash), settings.max_multiplier), 5000);
  }, [form, settings, seed]);

  if (!form || !settings) return <Panel title="Aviator formula"><p className="text-sm text-muted-foreground">Loading…</p></Panel>;

  const set = (p: Partial<Formula>) => setForm({ ...form, ...p });
  const houseEdgePct = Math.round(settings.house_edge * 10000) / 100;
  const maxBucket = Math.max(1, ...(dist?.buckets.map((b) => b.count) ?? [1]));

  const save = async () => {
    const growth = Number(form.growth_per_ms);
    const instant = Number(form.instant_crash_prob);
    const minC = Number(form.min_crash);
    const maxC = Number(form.max_crash);
    if (!Number.isFinite(growth) || growth <= 0) { toast.error("Growth rate must be above 0"); return; }
    if (!Number.isFinite(instant) || instant < 0 || instant > 0.2) { toast.error("Instant crash chance must be between 0% and 20%"); return; }
    if (!Number.isFinite(minC) || minC < 1) { toast.error("Lowest crash point must be at least 1.00x"); return; }
    if (!Number.isFinite(maxC) || maxC < 1 || maxC < minC) { toast.error("Crash ceiling must be at least 1x and at least the lowest crash point"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_save_formula", {
      _growth_per_ms: growth,
      _instant_crash_prob: instant,
      _min_crash: minC,
      _max_crash: maxC,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setForm(data as unknown as Formula);
    toast.success("Aviator formula saved. New rounds will use these settings.");
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setForm({ ...form, growth_per_ms: p.growth, instant_crash_prob: p.instant, min_crash: p.min, max_crash: p.max });
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Aviator crash formula"
        description="Fine-tune how the plane flies. These dials control every Real-mode round, on top of the house edge set in Game settings."
        actions={
          <div className="flex gap-1.5">
            <GhostButton onClick={() => setSeed((s) => s + 1)} className="gap-1.5">
              <RefreshCw className="size-3.5" /> Re-run sim
            </GhostButton>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="admin-glass glass-hover flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-foreground"
            >
              <Sparkles className="size-3 text-gold" /> {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Growth rate per ms" hint="How fast the multiplier climbs. Higher = faster, shorter rounds. Default 0.00008.">
            <input className="auth-input" inputMode="decimal" value={String(form.growth_per_ms)} onChange={(e) => set({ growth_per_ms: Number(e.target.value) })} />
          </Field>
          <Field label="Instant crash chance (0–0.2)" hint="Fraction of rounds that crash at the lowest point immediately. 0.03 = 3%.">
            <input className="auth-input" inputMode="decimal" value={String(form.instant_crash_prob)} onChange={(e) => set({ instant_crash_prob: Number(e.target.value) })} />
          </Field>
          <Field label="Lowest crash point (x)" hint="The plane never crashes below this. Raise it to make low outcomes less brutal.">
            <input className="auth-input" inputMode="decimal" value={String(form.min_crash)} onChange={(e) => set({ min_crash: Number(e.target.value) })} />
          </Field>
          <Field label="Crash ceiling (x)" hint="Hard cap on how high the plane can fly, before time-of-day caps.">
            <input className="auth-input" inputMode="decimal" value={String(form.max_crash)} onChange={(e) => set({ max_crash: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          <Cog className="size-4 text-gold" />
          <span>Current house edge: <span className="font-bold text-foreground">{houseEdgePct}%</span> (set in Game settings)</span>
          <span>·</span>
          <span>Multiplier cap: <span className="font-bold text-foreground">{formatMult(Math.min(Number(form.max_crash), settings.max_multiplier))}</span> (lower of formula & game settings)</span>
        </div>

        <PrimaryButton className="mt-4" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save formula"}</PrimaryButton>
      </Panel>

      {dist && (
        <Panel
          title="Distribution simulator"
          description="A 5,000-round Monte Carlo preview of the current dials (before you save). Shows how often each outcome band happens."
          actions={<span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><TrendingUp className="size-3.5 text-gold" /> 5,000 rounds</span>}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Max crash seen" value={formatMult(dist.maxCrash)} tone="good" />
            <StatCard label="Crashed under 2x" value={`${Math.round((dist.cashedUnder2 / dist.samples) * 100)}%`} tone="bad" />
            <StatCard label="Instant crash rate" value={`${Math.round(form.instant_crash_prob * 100)}%`} />
            <StatCard label="Rounds simulated" value={String(dist.samples)} />
          </div>
          <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">How often the plane reaches each height</h3>
          <div className="space-y-1.5">
            {dist.buckets.map((b) => (
              <div key={b.label} className="grid grid-cols-[110px_1fr_60px] items-center gap-2 text-xs">
                <span className="tabular-nums text-muted-foreground">{b.label}</span>
                <div className="h-2.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-gold transition-all"
                    style={{ width: `${(b.count / maxBucket) * 100}%` }}
                  />
                </div>
                <span className="text-right font-bold tabular-nums text-foreground">{b.count}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
