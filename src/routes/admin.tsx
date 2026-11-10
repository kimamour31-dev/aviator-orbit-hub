import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Clock, Gift, ListOrdered, Settings2, Users } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/omuh360-aviator-logo.jpeg.asset.json";
import { AdminBets } from "@/components/admin/AdminBets";
import { AdminOddsRules } from "@/components/admin/AdminOddsRules";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminPlayers } from "@/components/admin/AdminPlayers";
import { AdminPromoCodes } from "@/components/admin/AdminPromoCodes";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { useSession } from "@/hooks/use-session";

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

const TABS = [
  { id: "profit", label: "Profit", icon: BarChart3 },
  { id: "settings", label: "Game settings", icon: Settings2 },
  { id: "odds", label: "Time caps", icon: Clock },
  { id: "players", label: "Players & risk", icon: Users },
  { id: "promo", label: "Promo codes", icon: Gift },
  { id: "bets", label: "Bets", icon: ListOrdered },
] as const;
type TabId = (typeof TABS)[number]["id"];

function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<TabId>("profit");

  if (session.loading) return <Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>;
  if (!session.user)
    return (
      <Shell>
        <p className="text-sm text-foreground">Sign in with your admin account to open the panel.</p>
        <Link to="/auth" className="mt-3 inline-block rounded-xl bg-bet px-4 py-2 text-sm font-bold text-bet-foreground">Sign in</Link>
      </Shell>
    );
  if (!session.isAdmin) return <Shell><p className="text-sm text-destructive">This page is for admins only.</p></Shell>;

  return (
    <Shell>
      <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${tab === t.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </nav>
      {tab === "profit" && <AdminOverview />}
      {tab === "settings" && <AdminSettings />}
      {tab === "odds" && <AdminOddsRules />}
      {tab === "players" && <AdminPlayers />}
      {tab === "promo" && <AdminPromoCodes />}
      {tab === "bets" && <AdminBets />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-4 py-3">
          <img src={logo.url} alt="OMUH 360 Aviator logo" className="size-9 rounded-xl" />
          <p className="font-display text-base font-extrabold">
            OMUH <span className="text-gold">360</span> <span className="text-muted-foreground">· Admin</span>
          </p>
          <Link to="/" className="ml-auto text-xs font-semibold text-muted-foreground underline">Back to the game</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
    </div>
  );
}
