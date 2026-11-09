import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CRASHED_MS,
  STARTING_BALANCE,
  WAITING_MS,
  formatMult,
  formatTsh,
  multiplierAt,
  payout,
  randomCrashPoint,
  validateBet,
} from "@/lib/aviator";

export type Phase = "waiting" | "flying" | "crashed";
export type GameMode = "demo" | "real";
export type SlotStatus = "none" | "queued" | "active";

export type Slot = {
  amount: number;
  status: SlotStatus;
  stake: number;
  autoBet: boolean;
  autoCashout: boolean;
  autoCashoutAt: number;
};

export type MyBet = {
  id: string;
  round: number;
  stake: number;
  cashedAt: number | null;
  win: number;
  time: number;
};

export type SimBet = {
  name: string;
  stake: number;
  target: number;
  cashedAt: number | null;
};

const NAMES = [
  "AcePilot_99", "CrashMaster", "CryptoFlyer", "NairobiKing", "PilotSarah", "OmuhRider",
  "HyperJet", "SkyHigh_88", "DarFalcon", "ZanziWings", "MwanzaAce", "KiliCloud",
  "ArushaJet", "TangaTurbo", "DodomaDash", "BongoBird", "LuckyLanding", "RedBaron_TZ",
  "Mbeya_Mach", "SereneSky", "JetJuma", "AmaniAir", "HakunaHeight", "NeemaNose",
];
const STAKES = [500, 1000, 1000, 2000, 2000, 5000, 5000, 10000, 20000];

function makeSimBets(): SimBet[] {
  const count = 10 + Math.floor(Math.random() * 14);
  const pool = [...NAMES].sort(() => Math.random() - 0.5).slice(0, count);
  return pool.map((name) => ({
    name,
    stake: STAKES[Math.floor(Math.random() * STAKES.length)] ?? 1000,
    target: Math.round((1.1 + Math.random() ** 2.2 * 8) * 100) / 100,
    cashedAt: null,
  }));
}

function seedHistory(): number[] {
  return [1.77, 1.84, 1.12, 4.35, 1.05, 2.78, 12.4, 1.45, 1.02, 3.1, 8.92, 1.95, 1.22, 18.5, 1.01, 2.15];
}

const STORAGE_KEY = "omuh360-aviator-demo-v1";

function newSlot(amount: number): Slot {
  return { amount, status: "none", stake: 0, autoBet: false, autoCashout: false, autoCashoutAt: 2 };
}

type GameState = {
  phase: Phase;
  phaseStart: number;
  round: number;
  crashPoint: number;
  multiplier: number;
  balance: number;
  slots: [Slot, Slot];
  history: number[];
  myBets: MyBet[];
  simBets: SimBet[];
  topWins: MyBet[];
  realBalance: number;
  realRoundId: string | null;
  realPending: boolean;
  cashing: [boolean, boolean];
};

type RealBetRow = { id: string; slot: number; status: string; cashed_at: number | null; payout: number; stake: number };

export function useAviatorGame(mode: GameMode = "demo", realBalance: number | null = null) {
  const modeRef = useRef<GameMode>(mode);
  const g = useRef<GameState>({
    phase: "waiting",
    phaseStart: 0,
    round: 1,
    crashPoint: 1,
    multiplier: 1,
    balance: STARTING_BALANCE,
    slots: [newSlot(1000), newSlot(500)],
    history: seedHistory(),
    myBets: [],
    simBets: [],
    topWins: [],
    realBalance: 0,
    realRoundId: null,
    realPending: false,
    cashing: [false, false],
  });
  const [, setTick] = useState(0);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const render = useCallback(() => setTick((t) => (t + 1) % 1_000_000), []);

  // Keep real balance in sync with the account
  useEffect(() => {
    if (realBalance !== null) {
      g.current.realBalance = realBalance;
      render();
    }
  }, [realBalance, render]);

  // Switching mode clears unplayed bets and refunds them to the right wallet
  useEffect(() => {
    if (modeRef.current === mode) return;
    const s = g.current;
    s.slots.forEach((slot) => {
      if (slot.status === "queued") {
        if (modeRef.current === "demo") s.balance += slot.stake;
        else s.realBalance += slot.stake;
      }
      if (slot.status !== "active") {
        slot.status = "none";
        slot.stake = 0;
      }
      slot.autoBet = false;
    });
    modeRef.current = mode;
    render();
  }, [mode, render]);

  // Load saved demo wallet
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Pick<GameState, "balance" | "myBets" | "topWins">>;
        if (typeof saved.balance === "number") g.current.balance = saved.balance;
        if (Array.isArray(saved.myBets)) g.current.myBets = saved.myBets.slice(0, 50);
        if (Array.isArray(saved.topWins)) g.current.topWins = saved.topWins.slice(0, 20);
      }
    } catch {
      /* ignore */
    }
    g.current.simBets = makeSimBets();
    g.current.phaseStart = performance.now();
    setHydrated(true);
    render();
  }, [render]);

  const persist = useCallback(() => {
    const { balance, myBets, topWins } = g.current;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance, myBets, topWins }));
    } catch {
      /* ignore */
    }
  }, []);

  const recordBet = useCallback((bet: MyBet) => {
    const s = g.current;
    s.myBets = [bet, ...s.myBets].slice(0, 50);
    if (bet.cashedAt) {
      s.topWins = [...s.topWins, bet].sort((a, b) => b.win - a.win).slice(0, 20);
    }
  }, []);

  const placeBet = useCallback(
    (i: 0 | 1, silent = false) => {
      const s = g.current;
      const slot = s.slots[i];
      if (slot.status !== "none") return false;
      const real = modeRef.current === "real";
      const check = validateBet(slot.amount, real ? s.realBalance : s.balance);
      if (!check.ok) {
        if (!silent) toast.error(real ? check.reason.replace("demo credits", "balance") : check.reason);
        return false;
      }
      if (real) s.realBalance -= slot.amount;
      else s.balance -= slot.amount;
      slot.stake = slot.amount;
      slot.status = "queued";
      persist();
      render();
      return true;
    },
    [persist, render],
  );

  const cancelBet = useCallback(
    (i: 0 | 1) => {
      const s = g.current;
      const slot = s.slots[i];
      if (slot.status !== "queued") return;
      if (modeRef.current === "real") s.realBalance += slot.stake;
      else s.balance += slot.stake;
      slot.stake = 0;
      slot.status = "none";
      persist();
      render();
    },
    [persist, render],
  );

  const cashOut = useCallback(
    (i: 0 | 1, at?: number) => {
      const s = g.current;
      const slot = s.slots[i];
      if (slot.status !== "active" || s.phase !== "flying") return;
      if (modeRef.current === "real") {
        if (!s.realRoundId || s.cashing[i]) return;
        s.cashing[i] = true;
        const roundId = s.realRoundId;
        const round = s.round;
        const stake = slot.stake;
        void supabase.rpc("cash_out_real", { _round_id: roundId, _slot: i }).then(({ data, error }) => {
          s.cashing[i] = false;
          const res = data as { ok: boolean; reason?: string; multiplier?: number; payout?: number; balance?: number } | null;
          if (error || !res?.ok) {
            toast.error(error?.message ?? res?.reason ?? "Cash out failed");
            return;
          }
          const m = Number(res.multiplier);
          const win = Number(res.payout);
          s.realBalance = Number(res.balance);
          recordBet({ id: `${round}-${i}`, round, stake, cashedAt: m, win, time: Date.now() });
          toast.success(`Cashed out at ${formatMult(m)}`, { description: `You won ${formatTsh(win)}` });
          if (slot.status === "active") {
            slot.status = "none";
            slot.stake = 0;
          }
          render();
        });
        return;
      }
      const m = at ?? s.multiplier;
      const win = payout(slot.stake, m);
      s.balance += win;
      recordBet({ id: `${s.round}-${i}`, round: s.round, stake: slot.stake, cashedAt: m, win, time: Date.now() });
      toast.success(`Cashed out at ${formatMult(m)}`, { description: `You won ${formatTsh(win)}` });
      slot.status = "none";
      slot.stake = 0;
      persist();
      render();
    },
    [persist, recordBet, render],
  );

  const updateSlot = useCallback(
    (i: 0 | 1, patch: Partial<Slot>) => {
      Object.assign(g.current.slots[i], patch);
      render();
    },
    [render],
  );

  const resetCredits = useCallback(() => {
    const s = g.current;
    s.balance = STARTING_BALANCE;
    persist();
    render();
    toast.success(`Demo credits reset to ${formatTsh(STARTING_BALANCE)}`);
  }, [persist, render]);

  // Real mode: the server decides the crash point; the client only learns it once the plane flies away.
  const startRealRound = useCallback(() => {
    const s = g.current;
    const [a, b] = s.slots;
    s.realPending = true;
    s.crashPoint = Number.POSITIVE_INFINITY;
    const stake = (sl: Slot) => (sl.status === "active" ? sl.stake : 0);
    const auto = (sl: Slot) => (sl.status === "active" && sl.autoCashout ? sl.autoCashoutAt : null);
    void supabase
      .rpc("start_real_round", {
        _stake1: stake(a),
        _auto1: auto(a) as number,
        _stake2: stake(b),
        _auto2: auto(b) as number,
      })
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error(error?.message ?? "Could not place bet");
          s.slots.forEach((sl) => {
            if (sl.status === "active") {
              s.realBalance += sl.stake;
              sl.status = "none";
              sl.stake = 0;
            }
          });
          s.realPending = false;
          s.crashPoint = randomCrashPoint();
          render();
          return;
        }
        const res = data as { round_id: string; balance: number };
        s.realRoundId = res.round_id;
        s.realBalance = Number(res.balance);
        s.realPending = false;
        pollReal(res.round_id);
      });
  }, [render]);

  const pollReal = useCallback(
    (roundId: string) => {
      const tick = async () => {
        const s = g.current;
        if (s.realRoundId !== roundId) return;
        const { data, error } = await supabase.rpc("real_round_status", { _round_id: roundId });
        if (error) {
          setTimeout(tick, 800);
          return;
        }
        const res = data as { crashed: boolean; crash_point?: number; balance?: number; bets?: RealBetRow[] };
        if (!res.crashed) {
          setTimeout(tick, 350);
          return;
        }
        s.crashPoint = Number(res.crash_point);
        s.realBalance = Number(res.balance);
        // auto cash-outs settled by the server
        (res.bets ?? []).forEach((b) => {
          const slot = s.slots[b.slot as 0 | 1];
          if (b.status === "won" && slot.status === "active") {
            recordBet({ id: `${s.round}-${b.slot}`, round: s.round, stake: Number(b.stake), cashedAt: Number(b.cashed_at), win: Number(b.payout), time: Date.now() });
            toast.success(`Auto cashed out at ${formatMult(Number(b.cashed_at))}`, { description: `You won ${formatTsh(Number(b.payout))}` });
            slot.status = "none";
            slot.stake = 0;
          }
        });
      };
      setTimeout(tick, 300);
    },
    [recordBet],
  );

  // Game loop
  useEffect(() => {
    if (!hydrated) return;
    let raf = 0;
    const loop = (t: number) => {
      const s = g.current;
      const elapsed = t - s.phaseStart;

      if (s.phase === "waiting" && elapsed >= WAITING_MS) {
        s.phase = "flying";
        s.phaseStart = t;
        s.crashPoint = randomCrashPoint();
        s.multiplier = 1;
        s.slots.forEach((slot) => {
          if (slot.status === "queued") slot.status = "active";
        });
        if (modeRef.current === "real" && s.slots.some((sl) => sl.status === "active")) {
          startRealRound();
        }
      } else if (s.phase === "flying") {
        const m = multiplierAt(elapsed);
        if (m >= s.crashPoint && !s.realPending) {
          s.multiplier = s.crashPoint;
          s.phase = "crashed";
          s.phaseStart = t;
          s.slots.forEach((slot, idx) => {
            if (slot.status === "active") {
              recordBet({ id: `${s.round}-${idx}`, round: s.round, stake: slot.stake, cashedAt: null, win: 0, time: Date.now() });
              slot.status = "none";
              slot.stake = 0;
            }
          });
          s.history = [s.crashPoint, ...s.history].slice(0, 30);
          s.realRoundId = null;
          persist();
        } else {
          s.multiplier = m;
          s.slots.forEach((slot, idx) => {
            if (slot.status === "active" && slot.autoCashout && m >= slot.autoCashoutAt && !s.realPending) {
              cashOut(idx as 0 | 1, slot.autoCashoutAt);
            }
          });
          s.simBets.forEach((b) => {
            if (b.cashedAt === null && m >= b.target) b.cashedAt = b.target;
          });
        }
      } else if (s.phase === "crashed" && elapsed >= CRASHED_MS) {
        s.phase = "waiting";
        s.phaseStart = t;
        s.round += 1;
        s.multiplier = 1;
        s.simBets = makeSimBets();
        s.slots.forEach((slot, idx) => {
          if (slot.autoBet && slot.status === "none") {
            if (!placeBet(idx as 0 | 1, true)) {
              slot.autoBet = false;
              toast.error(`Auto bet #${idx + 1} stopped: not enough ${modeRef.current === "real" ? "balance" : "demo credits"}.`);
            }
          }
        });
      }

      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hydrated, cashOut, persist, placeBet, recordBet, startRealRound]);

  const s = g.current;
  return {
    hydrated,
    phase: s.phase,
    elapsed: hydrated ? Math.max(0, now - s.phaseStart) : 0,
    round: s.round,
    multiplier: s.multiplier,
    balance: mode === "real" ? s.realBalance : s.balance,
    slots: s.slots,
    history: s.history,
    myBets: s.myBets,
    simBets: s.simBets,
    topWins: s.topWins,
    placeBet,
    cancelBet,
    cashOut,
    updateSlot,
    resetCredits,
  };
}

export type AviatorGame = ReturnType<typeof useAviatorGame>;
