import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatMult, formatTsh } from "@/lib/aviator";
import { formatPhone } from "@/lib/phone";
import { Panel } from "./shared";

export function AdminBets() {
  const [bets, setBets] = useState<Tables<"real_bets">[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void supabase.from("real_bets").select("*").order("created_at", { ascending: false }).limit(100).then(async ({ data }) => {
      const rows = data ?? [];
      setBets(rows);
      const ids = [...new Set(rows.map((b) => b.user_id))];
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, phone, display_name").in("id", ids);
        setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.display_name || formatPhone(p.phone)])));
      }
    });
  }, []);

  return (
    <Panel title="Latest real bets" description="The 100 most recent Real-mode bets from all players.">
      {!bets ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : bets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No real bets yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2">Time</th>
                <th className="pr-2">Player</th>
                <th className="pr-2 text-right">Stake</th>
                <th className="pr-2 text-right">Cashed at</th>
                <th className="pr-2 text-right">Payout</th>
                <th className="text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bets.map((b) => (
                <tr key={b.id} className="text-foreground">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-muted-foreground">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="truncate pr-2">{names[b.user_id] ?? "…"}</td>
                  <td className="pr-2 text-right tabular-nums">{formatTsh(Number(b.stake))}</td>
                  <td className="pr-2 text-right tabular-nums">{b.cashed_at ? formatMult(Number(b.cashed_at)) : "—"}</td>
                  <td className="pr-2 text-right tabular-nums">{formatTsh(Number(b.payout))}</td>
                  <td className={`text-right font-bold uppercase ${b.status === "won" ? "text-tier-low" : b.status === "lost" ? "text-destructive" : "text-muted-foreground"}`}>
                    {b.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
