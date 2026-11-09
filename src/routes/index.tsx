import { createFileRoute } from "@tanstack/react-router";
import { BetConsole } from "@/components/aviator/BetConsole";
import { BetsPanel } from "@/components/aviator/BetsPanel";
import { FlightBoard } from "@/components/aviator/FlightBoard";
import { Header } from "@/components/aviator/Header";
import { HistoryStrip } from "@/components/aviator/HistoryStrip";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAviatorGame, type GameMode } from "@/hooks/use-aviator-game";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OMUH 360 Aviator — Crash Game Demo" },
      {
        name: "description",
        content: "Play the OMUH 360 Aviator crash game for free: bet, watch the plane climb and cash out before it flies away.",
      },
      { property: "og:title", content: "OMUH 360 Aviator — Crash Game Demo" },
      {
        property: "og:description",
        content: "Bet, watch the multiplier climb and cash out before the plane flies away. Free demo with virtual credits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const session = useSession();
  const navigate = useNavigate();
  const [modeChoice, setModeChoice] = useState<GameMode>("demo");
  const mode: GameMode = modeChoice === "real" && session.user ? "real" : "demo";
  const game = useAviatorGame(mode, session.profile?.balance ?? null);

  const changeMode = (m: GameMode) => {
    if (m === "real" && !session.user) {
      void navigate({ to: "/auth" });
      return;
    }
    setModeChoice(m);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        balance={game.balance}
        onReset={game.resetCredits}
        mode={mode}
        onModeChange={changeMode}
        signedIn={Boolean(session.user)}
        isAdmin={session.isAdmin}
        onSignOut={() => {
          setModeChoice("demo");
          void session.signOut();
        }}
      />
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
        <p className="pb-4 text-center text-xs text-muted-foreground">
          {mode === "real"
            ? "Real mode · account balance. Deposits and withdrawals are not live yet — balances are added by the operator."
            : "Demo mode with free virtual credits. Switch to Real to play with your account balance."}
        </p>
      </main>
    </div>
  );
}
