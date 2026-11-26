import { createFileRoute } from "@tanstack/react-router";
import { BetConsole } from "@/components/aviator/BetConsole";
import { BetsPanel } from "@/components/aviator/BetsPanel";
import { FlightBoard } from "@/components/aviator/FlightBoard";
import { Header } from "@/components/aviator/Header";
import { HistoryStrip } from "@/components/aviator/HistoryStrip";
import { useAviatorGame } from "@/hooks/use-aviator-game";
import { useSession } from "@/hooks/use-session";
import { Landing } from "@/components/aviator/Landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Omuh bet — Aviator Crash Game" },
      {
        name: "description",
        content:
          "Play the Omuh bet Aviator crash game: bet, watch the plane climb and cash out before it flies away.",
      },
      { property: "og:title", content: "Omuh bet — Aviator Crash Game" },
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
    <div className="min-h-screen bg-background">
      <Header
        balance={session.user ? game.balance : 0}
        signedIn={Boolean(session.user)}
        userId={session.user?.id}
        phone={session.profile?.phone}
        isAdmin={session.isAdmin}
        onSignOut={() => void session.signOut()}
        onBalanceChange={() => void session.refresh()}
      />
      {!session.user ? (
        <Landing loading={session.loading} game={game} />
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
