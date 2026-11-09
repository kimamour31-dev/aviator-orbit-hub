import { HelpCircle, LogIn, LogOut, RotateCcw, Settings, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { GameMode } from "@/hooks/use-aviator-game";
import logo from "@/assets/omuh360-aviator-logo.jpeg.asset.json";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatTsh } from "@/lib/aviator";

type HeaderProps = {
  balance: number;
  onReset: () => void;
  mode: GameMode;
  onModeChange: (m: GameMode) => void;
  signedIn: boolean;
  isAdmin: boolean;
  onSignOut: () => void;
};

export function Header({ balance, onReset, mode, onModeChange, signedIn, isAdmin, onSignOut }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <img src={logo.url} alt="OMUH 360 Aviator logo" width={44} height={44} className="size-10 rounded-xl sm:size-11" />
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold tracking-tight text-foreground">
              OMUH <span className="text-gold">360</span>
            </p>
            <span className="rounded bg-primary px-1.5 py-px text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
              Aviator
            </span>
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-2 md:flex">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-tier-low" /> Fair random rounds
          </span>
          <HowToPlay />
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-bet" /> 99% RTP
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <div className="flex rounded-full border border-border bg-card p-0.5 text-[11px] font-bold uppercase">
            {(["demo", "real"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`rounded-full px-3 py-1 transition-colors ${mode === m ? (m === "real" ? "bg-gold text-background" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="md:hidden">
            <HowToPlay compact />
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-1 text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{mode === "real" ? "Balance" : "Demo balance"}</p>
            <p className="font-display text-sm font-bold tabular-nums text-foreground">{formatTsh(balance)}</p>
          </div>
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
              <Settings className="size-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          {signedIn ? (
            <button onClick={onSignOut} aria-label="Sign out" className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
              <LogOut className="size-3.5" />
            </button>
          ) : (
            <Link to="/auth" className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
              <LogIn className="size-3.5" /> Sign in
            </Link>
          )}
          {mode === "demo" && <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:brightness-110"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Reset credits</span>
          </button>}
        </div>
      </div>
    </header>
  );
}

function HowToPlay({ compact = false }: { compact?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <HelpCircle className="size-3.5" /> {!compact && "How to Play"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">How to play Aviator</DialogTitle>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li>
            <span className="font-bold text-foreground">1. Place a bet</span> before takeoff. You can use two bet consoles at once.
          </li>
          <li>
            <span className="font-bold text-foreground">2. Watch the plane climb.</span> The multiplier grows the longer it flies.
          </li>
          <li>
            <span className="font-bold text-foreground">3. Cash out</span> before it flies away to win your bet times the multiplier. Wait too long and the bet is lost.
          </li>
          <li>
            <span className="font-bold text-foreground">Auto mode:</span> bet every round and cash out automatically at a multiplier you choose.
          </li>
        </ol>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          This is a free demo using virtual credits. Nothing here can be deposited, withdrawn or exchanged for real money.
        </p>
      </DialogContent>
    </Dialog>
  );
}
