import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
};

export function useAviatorGame() {
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
  });
  const [, setTick] = useState(0);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const render = useCallback(() => setTick((t) => (t + 1) % 1_000_000), []);

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
      const check = validateBet(slot.amount, s.balance);
      if (!check.ok) {
        if (!silent) toast.error(check.reason);
        return false;
      }
      s.balance -= slot.amount;
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
      s.balance += slot.stake;
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
      } else if (s.phase === "flying") {
        const m = multiplierAt(elapsed);
        if (m >= s.crashPoint) {
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
          persist();
        } else {
          s.multiplier = m;
          s.slots.forEach((slot, idx) => {
            if (slot.status === "active" && slot.autoCashout && m >= slot.autoCashoutAt) {
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
              toast.error(`Auto bet #${idx + 1} stopped: not enough demo credits.`);
            }
          }
        });
      }

      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hydrated, cashOut, persist, placeBet, recordBet]);

  const s = g.current;
  return {
    hydrated,
    phase: s.phase,
    elapsed: hydrated ? Math.max(0, now - s.phaseStart) : 0,
    round: s.round,
    multiplier: s.multiplier,
    balance: s.balance,
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
