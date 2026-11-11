import { createFileRoute, Link } from "@tanstack/react-router";
import { BetConsole } from "@/components/aviator/BetConsole";
import { BetsPanel } from "@/components/aviator/BetsPanel";
import { FlightBoard } from "@/components/aviator/FlightBoard";
import { Header } from "@/components/aviator/Header";
import { HistoryStrip } from "@/components/aviator/HistoryStrip";
import { useAviatorGame } from "@/hooks/use-aviator-game";
import { useSession } from "@/hooks/use-session";
import logo from "@/assets/omuh360-aviator-logo.jpeg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OMUH 360 Aviator — Crash Game" },
      {
        name: "description",
        content:
          "Play the OMUH 360 Aviator crash game: bet, watch the plane climb and cash out before it flies away.",
      },
      { property: "og:title", content: "OMUH 360 Aviator — Crash Game" },
      {
        property: "og:description",
        content:
          "Bet, watch the multiplier climb and cash out before the plane flies away. Play with your account balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const session = useSession();
  const game = useAviatorGame(session.profile?.balance ?? null);

  return (
    <div className="min-h-screen bg-background bg-[radial-gradient(ellipse_at_top,_rgba(220,38,38,0.12),_transparent_60%)]">
      <Header
        balance={session.user ? game.balance : null}
        signedIn={Boolean(session.user)}
        userId={session.user?.id}
        phone={session.profile?.phone}
        isAdmin={session.isAdmin}
        onSignOut={() => void session.signOut()}
      />
      {!session.user ? (
        <SignedOut loading={session.loading} game={game} />
      ) : (
        <main className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 sm:px-5">
          <HistoryStrip history={game.history} />
          <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
            <div className="order-2 h-[520px] lg:order-1 lg:h-auto">
              <BetsPanel
                phase={game.phase}
                simBets={game.simBets}
                myBets={game.myBets}
                topWins={game.topWins}
              />
            </div>
            <div className="order-1 space-y-3 lg:order-2">
              <FlightBoard
                phase={game.phase}
                elapsed={game.elapsed}
                multiplier={game.multiplier}
                round={game.round}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {([0, 1] as const).map((i) => (
                  <BetConsole
                    key={i}
                    index={i}
                    slot={game.slots[i]}
                    phase={game.phase}
                    multiplier={game.multiplier}
                    onPlace={() => game.placeBet(i)}
                    onCancel={() => game.cancelBet(i)}
                    onCashOut={() => game.cashOut(i)}
                    onChange={(p) => game.updateSlot(i, p)}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function SignedOut({
  loading,
  game,
}: {
  loading: boolean;
  game: ReturnType<typeof useAviatorGame>;
}) {
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-3 py-5 sm:px-5">
      <HistoryStrip history={game.history} />

      <div className="grid items-stretch gap-5 lg:grid-cols-[420px_1fr]">
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card/90 p-7 shadow-2xl backdrop-blur">
          <div>
            <div className="flex items-center gap-3.5">
              <img
                src={logo.url}
                alt="OMUH 360 Aviator logo"
                className="size-16 rounded-2xl border border-red-500/30 shadow-lg"
              />
              <div>
                <span className="inline-block rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-red-400">
                  Live Crash Game
                </span>
                <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                  Play <span className="text-gold">Aviator</span>
                </h1>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Place your stake in <strong className="text-foreground">TSh</strong>, watch the multiplier climb in real time, and cash out before the plane flies away.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-center">
              <div>
                <div className="text-xs font-bold text-gold">1. BET</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Set your TSh stake
                </div>
              </div>
              <div className="border-x border-border/60">
                <div className="text-xs font-bold text-gold">2. WATCH</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Multiplier climbs
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-bet">3. CASH OUT</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Before fly-away
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Link
              to="/auth"
              className="inline-flex w-full items-center justify-center rounded-xl bg-bet py-3 text-base font-extrabold text-bet-foreground shadow-lg shadow-emerald-500/20 transition hover:brightness-110"
            >
              {loading ? "Checking your session…" : "Sign in or Register to Play"}
            </Link>

            <div className="pt-2 text-center">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Fast Deposits & Withdrawals via
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-foreground/80">
                <span className="rounded-md border border-border bg-background px-2.5 py-1">
                  M-Pesa
                </span>
                <span className="rounded-md border border-border bg-background px-2.5 py-1">
                  Mixx by Yas
                </span>
                <span className="rounded-md border border-border bg-background px-2.5 py-1">
                  Airtel Money
                </span>
                <span className="rounded-md border border-border bg-background px-2.5 py-1">
                  HaloPesa
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-card/50">
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-amber-500/30 bg-background/85 px-3 py-1 text-xs font-semibold text-gold backdrop-blur">
            ● Live Round Preview
          </div>
          <FlightBoard
            phase={game.phase}
            elapsed={game.elapsed}
            multiplier={game.multiplier}
            round={game.round}
          />
        </div>
      </div>

      <div className="h-[340px]">
        <BetsPanel
          phase={game.phase}
          simBets={game.simBets}
          myBets={[]}
          topWins={game.topWins}
        />
      </div>
    </main>
  );
}
