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
        content: "Play the OMUH 360 Aviator crash game: bet, watch the plane climb and cash out before it flies away.",
      },
      { property: "og:title", content: "OMUH 360 Aviator — Crash Game" },
      {
        property: "og:description",
        content: "Bet, watch the multiplier climb and cash out before the plane flies away. Play with your account balance.",
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
    <div className="min-h-screen bg-background">
      <Header
        balance={game.balance}
        signedIn={Boolean(session.user)}
        userId={session.user?.id}
        phone={session.profile?.phone}
        isAdmin={session.isAdmin}
        onSignOut={() => void session.signOut()}
      />
      {!session.user ? (
        <SignedOut loading={session.loading} />
      ) : (
        <main className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 sm:px-5">
          <HistoryStrip history={game.history} />
          <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
            <div className="order-2 h-[520px] lg:order-1 lg:h-auto">
              <BetsPanel phase={game.phase} simBets={game.simBets} myBets={game.myBets} topWins={game.topWins} />
            </div>
            <div className="order-1 space-y-3 lg:order-2">
              <FlightBoard phase={game.phase} elapsed={game.elapsed} multiplier={game.multiplier} round={game.round} />
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

function SignedOut({ loading }: { loading: boolean }) {
  return (
    <main className="mx-auto flex max-w-[1400px] items-center justify-center px-3 py-16 sm:px-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <img src={logo.url} alt="OMUH 360 Aviator logo" className="mx-auto size-16 rounded-2xl" />
        <h1 className="mt-4 font-display text-2xl font-extrabold text-foreground">
          Play <span className="text-gold">Aviator</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your phone number and password to place bets with your account balance.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-bet py-2.5 font-bold text-bet-foreground hover:brightness-110"
        >
          {loading ? "Checking your session…" : "Sign in or register"}
        </Link>
      </div>
    </main>
  );
}
