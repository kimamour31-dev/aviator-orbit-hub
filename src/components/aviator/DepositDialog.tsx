import { useCallback, useEffect, useState } from "react";
import { ArrowUpFromLine, CreditCard, Smartphone, History, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatTsh } from "@/lib/aviator";
import { checkWithdrawal, checkDeposit, DEPOSIT_PRESETS, NETWORKS, type NetworkId } from "@/lib/deposit";
import { formatPhone } from "@/lib/phone";
import { checkHarakaPayDeposit, startHarakaPayDeposit } from "@/lib/harakapay.functions";

type Deposit = Tables<"deposit_requests">;
type Withdrawal = Tables<"withdrawal_requests">;

const NETWORK_STYLE: Record<NetworkId, string> = {
  mpesa: "text-mpesa",
  tigo: "text-tigo lowercase",
  airtel: "text-airtel lowercase",
  halopesa: "text-halopesa",
};

function NetworkMark({ id }: { id: NetworkId }) {
  if (id === "mpesa")
    return (
      <span className="font-display text-sm font-extrabold tracking-tight text-mpesa">
        M<span className="text-mpesa-accent">-</span>PESA
      </span>
    );
  const label = NETWORKS.find((n) => n.id === id)!.label;
  return <span className={`font-display text-base font-extrabold tracking-tight ${NETWORK_STYLE[id]}`}>{label}</span>;
}

export function DepositDialog({
  userId,
  defaultPhone,
  balance,
  onBalanceChange,
}: {
  userId: string;
  defaultPhone?: string | undefined;
  balance: number;
  onBalanceChange?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pay" | "withdraw" | "history">("pay");
  const [waiting, setWaiting] = useState<{ id: string; amount: number; startedAt: number } | null>(null);
  const startDeposit = useServerFn(startHarakaPayDeposit);
  const checkDeposit_ = useServerFn(checkHarakaPayDeposit);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [network, setNetwork] = useState<NetworkId | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("5000");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Deposit[]>([]);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("deposit_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory(data ?? []);
    const { data: w } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setWithdrawals(w ?? []);
  }, [userId]);

  // While a PIN prompt is out, ask HarakaPay every few seconds whether the player has paid.
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped) return;
      const res = await checkDeposit_({ data: { id: waiting.id } }).catch(() => null);
      if (!res || stopped) return;
      if (res.status === "approved") {
        stopped = true;
        setWaiting(null);
        toast.success(`${formatTsh(waiting.amount)} added to your balance.`);
        onBalanceChange?.();
        void loadHistory();
        setTab("history");
      } else if (res.status === "rejected") {
        stopped = true;
        setWaiting(null);
        setError("The payment was cancelled or failed on your phone. Please try again.");
        void loadHistory();
      } else if (Date.now() - waiting.startedAt > 3 * 60_000) {
        stopped = true;
        setWaiting(null);
        toast.message("Still waiting for HarakaPay. Your balance updates as soon as the payment is confirmed.");
        void loadHistory();
        setTab("history");
      }
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waiting, checkDeposit_, loadHistory, onBalanceChange]);

  async function recheck(id: string) {
    const res = await checkDeposit_({ data: { id } }).catch(() => null);
    if (res?.status === "approved") {
      toast.success("Payment confirmed and added to your balance.");
      onBalanceChange?.();
    } else if (res?.status === "rejected") toast.error("This payment failed or was cancelled.");
    else toast.message("HarakaPay hasn't confirmed this payment yet.");
    void loadHistory();
  }

  useEffect(() => {
    if (!open) return;
    if (!phone && defaultPhone) setPhone(`0${defaultPhone.replace(/^255/, "")}`);
    void loadHistory();
  }, [open, defaultPhone, loadHistory, phone]);

  async function submitWithdraw() {
    const check = checkWithdrawal(network, phone, amount, balance);
    if (!check.ok) return setError(check.error);
    setError(null);
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("request_withdrawal", { _network: network!, _phone: check.phone, _amount: check.amount });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    toast.success(`Withdrawal of ${formatTsh(check.amount)} requested. It's taken from your balance and paid out once the operator sends it.`);
    await loadHistory();
    setTab("history");
  }

  async function submit() {
    const check = checkDeposit(network, phone, amount);
    if (!check.ok) return setError(check.error);
    setError(null);
    setBusy(true);
    const res = await startDeposit({ data: { network: network!, phone, amount } }).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : "Something went wrong. Please try again.",
    }));
    setBusy(false);
    if (!res.ok) {
      void loadHistory();
      return setError(res.error);
    }
    setWaiting({ id: res.id, amount: res.amount, startedAt: Date.now() });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="rounded-xl bg-bet px-3 py-2 text-xs font-bold text-bet-foreground hover:brightness-110">Deposit</button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 rounded-2xl border-border bg-card p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <CreditCard className="size-5 text-gold" /> Deposit &amp; Wallet Cashier
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background p-1">
            <button
              onClick={() => setTab("pay")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold ${tab === "pay" ? "bg-bet text-bet-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Smartphone className="size-4" /> Deposit
            </button>
            <button
              onClick={() => setTab("withdraw")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold ${tab === "withdraw" ? "bg-bet text-bet-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ArrowUpFromLine className="size-4" /> Withdraw
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold ${tab === "history" ? "bg-bet text-bet-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <History className="size-4" /> History
            </button>
          </div>

          {tab !== "history" ? (
            <>
              {tab === "withdraw" ? (
                <p className="text-sm text-muted-foreground">
                  Choose the network and number to receive your money. The amount is held from your balance now (
                  <span className="font-bold text-foreground">{formatTsh(balance)}</span> available) and returned if the operator declines.
                </p>
              ) : (
              <p className="text-sm text-muted-foreground">
                Select your network and enter your Tanzanian mobile number. You'll get a{" "}
                <span className="font-bold text-foreground">PIN prompt on your phone</span> — enter your PIN and the money is
                added to your balance automatically.
              </p>
              )}

              <div className="grid grid-cols-4 gap-2">
                {NETWORKS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    aria-label={n.label}
                    aria-pressed={network === n.id}
                    onClick={() => setNetwork(n.id)}
                    className={`flex h-14 items-center justify-center rounded-xl border bg-background transition ${network === n.id ? "border-bet ring-2 ring-bet" : "border-border hover:border-muted-foreground"}`}
                  >
                    <NetworkMark id={n.id} />
                  </button>
                ))}
              </div>


              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-foreground">Tanzania Mobile Number</span>
                <input
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712345678 or 0754123456"
                  maxLength={16}
                  className="w-full rounded-xl border border-bet/60 bg-background px-4 py-3 text-foreground outline-none placeholder:text-muted-foreground focus:border-bet"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-foreground">{tab === "withdraw" ? "Withdrawal" : "Deposit"} Amount (TSh)</span>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  maxLength={9}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-bet"
                />
              </label>

              <div className="grid grid-cols-4 gap-2">
                {DEPOSIT_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className={`rounded-lg py-2.5 text-sm font-bold tabular-nums ${amount === String(v) ? "bg-bet text-bet-foreground" : "border border-border bg-background text-foreground hover:bg-muted"}`}
                  >
                    {v.toLocaleString("en-US")}
                  </button>
                ))}
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              {tab === "pay" && waiting && (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-3 text-sm text-foreground">
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-gold" />
                  <div>
                    <p className="font-bold">Check your phone</p>
                    <p className="text-muted-foreground">
                      Enter your mobile money PIN to pay <span className="font-bold text-foreground">{formatTsh(waiting.amount)}</span>. This
                      updates by itself once you've paid.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={() => void (tab === "withdraw" ? submitWithdraw() : submit())}
                disabled={busy || (tab === "pay" && Boolean(waiting))}
                className="w-full rounded-xl bg-bet py-3.5 font-display text-base font-bold text-bet-foreground hover:brightness-110 disabled:opacity-60"
              >
                {busy ? "Sending…" : tab === "withdraw" ? "Request withdrawal" : waiting ? "Waiting for your PIN…" : "Deposit via Mobile Money (USSD Push)"}
              </button>
            </>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {history.length === 0 && withdrawals.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>}
              {withdrawals.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                  <div>
                    <p className="font-display text-sm font-bold tabular-nums text-destructive">−{formatTsh(Number(d.amount))} <span className="text-xs text-muted-foreground">withdrawal</span></p>
                    <p className="text-xs text-muted-foreground">
                      {NETWORKS.find((n) => n.id === d.network)?.label} · {formatPhone(d.phone)} · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
              {history.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                  <div>
                    <p className="font-display text-sm font-bold tabular-nums text-foreground">{formatTsh(Number(d.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {NETWORKS.find((n) => n.id === d.network)?.label} · {formatPhone(d.phone)} ·{" "}
                      {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.provider === "harakapay" && d.status === "pending" && (
                      <button onClick={() => void recheck(d.id)} className="text-xs font-bold text-gold hover:underline">
                        Check
                      </button>
                    )}
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved" || status === "paid"
      ? "bg-bet/15 text-bet"
      : status === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-cashout/15 text-cashout";
  const label = status === "paid" ? "Paid" : status === "approved" ? "Added" : status === "rejected" ? "Declined" : "Waiting";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>;
}
