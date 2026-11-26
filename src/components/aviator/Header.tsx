import { HelpCircle, LogIn, LogOut, Settings, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatTsh } from "@/lib/aviator";
import { DepositDialog } from "./DepositDialog";

type HeaderProps = {
  balance: number;
  signedIn: boolean;
  userId?: string | undefined;
  phone?: string | undefined;
  isAdmin: boolean;
  onSignOut: () => void;
  onBalanceChange?: () => void;
};

export function Header({ balance, signedIn, userId, phone, isAdmin, onSignOut, onBalanceChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      {/* Top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary to-bet" />
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.png" alt="Omuh bet logo" width={40} height={40} className="size-9 rounded-lg sm:size-10" />
          <div className="leading-none">
            <p className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground">
              Omuh<span className="text-primary"> bet</span>
            </p>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Aviator</span>
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-2 md:flex">
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-bet" /> Provably fair
          </span>
          <HowToPlay />
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-bet" /> 99% RTP
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <div className="md:hidden">
            <HowToPlay compact />
          </div>
          {signedIn && (
            <div className="rounded-lg border border-border bg-card px-3 py-1 text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Balance</p>
              <p className="font-display text-sm font-bold tabular-nums text-primary">{formatTsh(balance)}</p>
            </div>
          )}
          {signedIn && userId && <DepositDialog userId={userId} defaultPhone={phone} balance={balance} onBalanceChange={onBalanceChange} />}
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
              <Settings className="size-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          {signedIn ? (
            <button onClick={onSignOut} aria-label="Sign out" className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
              <LogOut className="size-3.5" />
            </button>
          ) : (
            <Link to="/auth" className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-foreground hover:brightness-110">
              <LogIn className="size-3.5" /> Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function HowToPlay({ compact = false }: { compact?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <HelpCircle className="size-3.5" /> {!compact && "How to Play"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase">How to play Aviator</DialogTitle>
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
          Play with your Omuh bet account balance. Top up any time with mobile money from the Deposit button.
        </p>
      </DialogContent>
    </Dialog>
  );
}
