import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatTsh } from "@/lib/aviator";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — OMUH 360 Aviator" },
      { name: "description", content: "Operator dashboard for OMUH 360 Aviator." },
      { property: "og:title", content: "Admin — OMUH 360 Aviator" },
      { property: "og:description", content: "Operator dashboard for OMUH 360 Aviator." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Stats = { staked: number; paid: number; bets: number; players: number; users_total: number; balances_total: number };

function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("admin_stats", { _days: 30 }).then(({ data, error }) => {
      if (error) setError("Admins only.");
      else setStats(data as unknown as Stats);
    });
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background p-6 text-foreground">
      <Link to="/" className="text-sm text-muted-foreground underline">Back to the game</Link>
      <h1 className="mt-3 font-display text-2xl font-extrabold">Admin · last 30 days</h1>
      {error && <p className="mt-4 text-destructive">{error}</p>}
      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card label="Profit" value={formatTsh(Number(stats.staked) - Number(stats.paid))} />
          <Card label="Total staked" value={formatTsh(Number(stats.staked))} />
          <Card label="Paid out" value={formatTsh(Number(stats.paid))} />
          <Card label="Bets" value={String(stats.bets)} />
          <Card label="Players" value={String(stats.players)} />
          <Card label="Player balances" value={formatTsh(Number(stats.balances_total))} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-bold">{value}</p>
    </div>
  );
}
