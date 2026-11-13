import { Link } from "@tanstack/react-router";
import { Banknote, Gift, Plane, Rocket, ShieldCheck, Smartphone, TrendingUp, Wallet } from "lucide-react";
import type { useAviatorGame } from "@/hooks/use-aviator-game";
import { formatMult, tierOf } from "@/lib/aviator";
import { cn } from "@/lib/utils";
import { FlightBoard } from "./FlightBoard";

type Game = ReturnType<typeof useAviatorGame>;

const tierText = { low: "text-tier-low", mid: "text-tier-mid", high: "text-tier-high" } as const;

const NETWORKS = [
  { name: "M-Pesa", className: "bg-mpesa text-primary-foreground" },
  { name: "Mixx by Yas", className: "bg-tigo text-primary-foreground" },
  { name: "Airtel Money", className: "bg-airtel text-primary-foreground" },
  { name: "HaloPesa", className: "bg-halopesa text-cashout-foreground" },
];

const STEPS = [
  { icon: Wallet, title: "Place your bet", text: "Choose your TSh stake before takeoff. Use two bets at once if you like." },
  { icon: TrendingUp, title: "Watch it climb", text: "The multiplier grows every second the plane stays in the sky." },
  { icon: Banknote, title: "Cash out in time", text: "Tap Cash Out before the plane flies away to win stake × multiplier." },
];

export function Landing({ loading, game }: { loading: boolean; game: Game }) {
  const live = game.phase === "flying";
  return (
    <main className="pb-24 md:pb-10">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="sky-rays pointer-events-none absolute inset-0 opacity-80" />
        <div className="relative mx-auto grid max-w-[1400px] items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:py-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Live crash game
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Fly high.
              <br />
              Cash out <span className="text-gold">before it&apos;s gone.</span>
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              OMUH <span className="font-bold text-gold">360</span> Aviator — bet in TSh, watch the multiplier rise and
              take your win at the moment you choose.
            </p>

            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-gold/30 bg-background/70 p-4 backdrop-blur sm:max-w-sm">
              <Plane className="size-8 shrink-0 -rotate-12 text-primary" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {live ? "Flying now" : game.phase === "crashed" ? "Flew away at" : "Next round starting"}
                </p>
                <p
                  className={cn(
                    "font-display text-4xl font-extrabold tabular-nums",
                    game.phase === "crashed" ? "text-primary" : "text-gold",
                  )}
                >
                  {formatMult(game.phase === "waiting" ? 1 : game.multiplier)}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-xl bg-bet px-7 py-3.5 text-base font-extrabold text-bet-foreground shadow-lg shadow-bet/25 transition hover:brightness-110"
              >
                <Rocket className="size-5" /> {loading ? "Checking…" : "Play now"}
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-bold text-foreground hover:bg-muted"
              >
                I have an account
              </Link>
            </div>
          </div>

          <div className="relative hidden overflow-hidden rounded-2xl border border-border bg-card/60 shadow-2xl sm:block">
            <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-gold/30 bg-background/85 px-3 py-1 text-xs font-semibold text-gold backdrop-blur">
              ● Live round preview
            </span>
            <FlightBoard phase={game.phase} elapsed={game.elapsed} multiplier={game.multiplier} round={game.round} />
          </div>
        </div>
      </section>

      {/* Recent flights ticker */}
      <section className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Recent flights
          </span>
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="marquee flex w-max gap-6">
              {[...game.history, ...game.history].map((m, i) => (
                <span key={i} className={cn("font-display text-sm font-bold tabular-nums", tierText[tierOf(m)])}>
                  {formatMult(m)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] space-y-12 px-4 py-12 sm:px-6">
        {/* How it works */}
        <section>
          <h2 className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">How it works</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
                <span className="absolute right-5 top-4 font-display text-5xl font-extrabold text-muted">{i + 1}</span>
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Promo + payments */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/20 via-card to-card p-7">
            <Gift className="absolute -right-4 -top-4 size-32 rotate-12 text-gold/10" />
            <span className="text-xs font-bold uppercase tracking-widest text-gold">First flight bonus</span>
            <h3 className="mt-2 font-display text-2xl font-extrabold text-foreground">Got a promo code?</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Enter it when you register to claim your sign-up bonus on your first flight.
            </p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-gold px-5 py-2.5 text-sm font-extrabold text-cashout-foreground hover:brightness-110"
            >
              Register with a code
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-card p-7">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Smartphone className="size-4" /> Mobile money
            </span>
            <h3 className="mt-2 font-display text-2xl font-extrabold text-foreground">Deposit & withdraw from your phone</h3>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {NETWORKS.map((n) => (
                <span key={n.name} className={cn("rounded-xl px-3 py-3 text-center text-sm font-extrabold", n.className)}>
                  {n.name}
                </span>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-tier-low" /> Every payment is checked by the OMUH 360 team.
            </p>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">18+ only. Play responsibly.</p>
      </div>

      {/* Sticky phone bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden">
        <Link to="/auth" className="rounded-xl border border-border bg-card py-3 text-center text-sm font-bold text-foreground">
          Sign in
        </Link>
        <Link to="/auth" className="rounded-xl bg-bet py-3 text-center text-sm font-extrabold text-bet-foreground">
          Register
        </Link>
      </div>
    </main>
  );
}
