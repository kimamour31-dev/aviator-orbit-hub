import { Fingerprint, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GhostButton, Panel, PrimaryButton, StatCard } from "./shared";

type SeedRow = {
  id: string;
  seed: string;
  seed_hash: string;
  status: string;
  created_at: string;
  retired_at: string | null;
};

type ActiveHash = { seed_hash: string; created_at: string } | null;

export function AdminProvablyFair() {
  const [seeds, setSeeds] = useState<SeedRow[]>([]);
  const [active, setActive] = useState<ActiveHash>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: hash }] = await Promise.all([
      supabase.from("server_seeds").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.rpc("public_active_seed_hash"),
    ]);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSeeds((data ?? []) as unknown as SeedRow[]);
    setActive((hash as unknown as ActiveHash) ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rotate = async () => {
    setRotating(true);
    const { data, error } = await supabase.rpc("admin_rotate_seed");
    setRotating(false);
    if (error) { toast.error(error.message); return; }
    const result = data as unknown as { revealed_seed: string; new_seed_hash: string };
    setRevealed(result.revealed_seed);
    toast.success("Server seed rotated. The old seed is now revealed and verifiable.");
    void load();
  };

  const activeSeed = seeds.find((s) => s.status === "active");

  return (
    <div className="space-y-4">
      <Panel
        title="Provably fair — server seed"
        description="The crash point for every round is derived from a secret server seed using HMAC-SHA256. Players only see the seed hash, so they can verify fairness after a seed is retired."
        actions={
          <GhostButton onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard label="Active seed hash" value={active?.seed_hash ? `${active.seed_hash.slice(0, 16)}…` : "—"} />
          <StatCard label="Seed created" value={active?.created_at ? new Date(active.created_at).toLocaleDateString() : "—"} />
          <StatCard label="Total seeds" value={String(seeds.length)} />
        </div>

        <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold" />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Rotate server seed</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Rotating retires the current seed (revealing it publicly so past rounds can be verified) and generates a fresh secret seed. Players see no disruption.
              </p>
              <PrimaryButton className="mt-3" disabled={rotating} onClick={rotate}>
                <KeyRound className="mr-1.5 size-4" /> {rotating ? "Rotating…" : "Rotate seed now"}
              </PrimaryButton>
            </div>
          </div>
        </div>

        {revealed && (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <Fingerprint className="size-3.5 text-gold" /> Revealed old seed
            </p>
            <code className="mt-1 block break-all rounded-lg bg-muted/60 p-2 text-[11px] text-foreground">{revealed}</code>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Share this with players so they can verify past rounds independently.</p>
          </div>
        )}
      </Panel>

      <Panel title="Seed history" description="Every server seed, newest first. Active seeds are hidden; retired seeds are shown in full.">
        {seeds.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No seeds yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Seed / hash</th>
                  <th className="py-2 pr-3 font-bold">Created</th>
                  <th className="py-2 font-bold">Retired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {seeds.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.status === "active" ? "bg-tier-low/15 text-tier-low" : "bg-muted text-muted-foreground"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {s.status === "active" ? (
                        <code className="text-[11px] text-muted-foreground">{s.seed_hash.slice(0, 24)}…</code>
                      ) : (
                        <code className="block max-w-xs break-all text-[11px] text-foreground">{s.seed}</code>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">{s.retired_at ? new Date(s.retired_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
