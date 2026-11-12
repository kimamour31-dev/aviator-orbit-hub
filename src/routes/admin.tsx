import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpFromLine, BarChart3, Bell, Clock, Gift, ListOrdered, PanelLeftClose, PanelLeftOpen, Phone, Settings2, Users, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "@/assets/omuh360-aviator-logo.jpeg.asset.json";
import { AdminBets } from "@/components/admin/AdminBets";
import { AdminDeposits } from "@/components/admin/AdminDeposits";
import { AdminOddsRules } from "@/components/admin/AdminOddsRules";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminPayments } from "@/components/admin/AdminPayments";
import { AdminWithdrawals } from "@/components/admin/AdminWithdrawals";
import { AdminPlayers } from "@/components/admin/AdminPlayers";
import { AdminPromoCodes } from "@/components/admin/AdminPromoCodes";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/lib/phone";

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

type TabId = "profit" | "deposits" | "withdrawals" | "payments" | "settings" | "odds" | "bets" | "players" | "promo";
type TabDef = { id: TabId; label: string; icon: LucideIcon };
const GROUPS: { label: string; tabs: TabDef[] }[] = [
  { label: "Finance", tabs: [
    { id: "profit", label: "Profit", icon: BarChart3 },
    { id: "deposits", label: "Deposits", icon: Wallet },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
    { id: "payments", label: "Payment numbers", icon: Phone },
  ]},
  { label: "Game control", tabs: [
    { id: "settings", label: "Game settings", icon: Settings2 },
    { id: "odds", label: "Time caps", icon: Clock },
    { id: "bets", label: "Bets", icon: ListOrdered },
  ]},
  { label: "Players", tabs: [
    { id: "players", label: "Players & risk", icon: Users },
    { id: "promo", label: "Promo codes", icon: Gift },
  ]},
];
const ALL_TABS: TabDef[] = GROUPS.flatMap((g) => g.tabs);

function usePending() {
  const [counts, setCounts] = useState({ deposits: 0, withdrawals: 0 });
  useEffect(() => {
    const load = async () => {
      const [d, w] = await Promise.all([
        supabase.from("deposit_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setCounts({ deposits: d.count ?? 0, withdrawals: w.count ?? 0 });
    };
    void load();
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, []);
  return counts;
}

function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<TabId>("profit");

  if (session.loading) return <Gate><p className="text-sm text-muted-foreground">Loading…</p></Gate>;
  if (!session.user)
    return (
      <Gate>
        <p className="text-sm text-foreground">Sign in with your admin account to open the panel.</p>
        <Link to="/auth" className="mt-3 inline-block rounded-xl bg-bet px-4 py-2 text-sm font-bold text-bet-foreground">Sign in</Link>
      </Gate>
    );
  if (!session.isAdmin) return <Gate><p className="text-sm text-destructive">This page is for admins only.</p></Gate>;
  return <Dashboard tab={tab} setTab={setTab} phone={session.profile?.phone} />;
}

function Dashboard({ tab, setTab, phone }: { tab: TabId; setTab: (t: TabId) => void; phone?: string | undefined }) {
  const pending = usePending();
  const [collapsed, setCollapsed] = useState(false);
  const badge = (id: string) => (id === "deposits" ? pending.deposits : id === "withdrawals" ? pending.withdrawals : 0);
  const current = ALL_TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-all md:flex ${collapsed ? "w-16" : "w-60"}`}>
        <div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
          <img src={logo.url} alt="OMUH 360 Aviator logo" className="size-9 shrink-0 rounded-xl" />
          {!collapsed && (
            <div className="leading-tight">
              <p className="font-display text-sm font-extrabold">OMUH <span className="text-gold">360</span></p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Operator</p>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {GROUPS.map((g) => (
            <div key={g.label}>
              {!collapsed && <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{g.label}</p>}
              <div className="space-y-0.5">
                {g.tabs.map((t) => {
                  const active = tab === t.id;
                  const n = badge(t.id);
                  return (
                    <button
                      key={t.id}
                      title={t.label}
                      onClick={() => setTab(t.id)}
                      className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold" />}
                      <t.icon className={`size-4 shrink-0 ${active ? "text-gold" : ""}`} />
                      {!collapsed && <span className="flex-1 text-left">{t.label}</span>}
                      {n > 0 && (
                        <span className={`rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground ${collapsed ? "absolute right-1 top-1" : ""}`}>{n}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center justify-center gap-2 border-t border-border py-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <img src={logo.url} alt="" className="size-8 rounded-lg md:hidden" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Admin</p>
              <h1 className="font-display text-lg font-extrabold leading-tight">{current.label}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {pending.deposits + pending.withdrawals > 0 && (
                <span className="hidden items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold sm:flex">
                  <Bell className="size-3.5" /> {pending.deposits + pending.withdrawals} waiting
                </span>
              )}
              {phone && <span className="hidden text-xs text-muted-foreground lg:inline">{formatPhone(phone)}</span>}
              <Link to="/" className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted">Back to game</Link>
            </div>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-4 pb-2 md:hidden">
            {ALL_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${tab === t.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}
              >
                <t.icon className="size-3.5" /> {t.label}
                {badge(t.id) > 0 && <span className="rounded-full bg-gold px-1.5 text-[10px] text-background">{badge(t.id)}</span>}
              </button>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {tab === "profit" && <AdminOverview />}
          {tab === "deposits" && <AdminDeposits />}
          {tab === "withdrawals" && <AdminWithdrawals />}
          {tab === "payments" && <AdminPayments />}
          {tab === "settings" && <AdminSettings />}
          {tab === "odds" && <AdminOddsRules />}
          {tab === "players" && <AdminPlayers />}
          {tab === "promo" && <AdminPromoCodes />}
          {tab === "bets" && <AdminBets />}
        </main>
      </div>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
        <img src={logo.url} alt="OMUH 360 Aviator logo" className="mx-auto mb-3 size-14 rounded-2xl" />
        <p className="mb-3 font-display text-lg font-extrabold">OMUH <span className="text-gold">360</span> Admin</p>
        {children}
      </div>
    </div>
  );
}
