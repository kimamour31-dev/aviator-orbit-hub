import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CRASHED_MS,
  WAITING_MS,
  formatMult,
  formatTsh,
  multiplierAt,
  randomCrashPoint,
  validateBet,
} from "@/lib/aviator";

// Server-authoritative growth rate; fetched from public_get_formula and swapped in.
let serverGrowthPerMs: number | null = null;
function growthPerMs(): number {
  return serverGrowthPerMs ?? 0.00008;
}
function multiplierAtServer(elapsedMs: number): number {
  return Math.exp(growthPerMs() * Math.max(0, elapsedMs));
}

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
  realRoundId: string | null;
  realPending: boolean;
  cashing: [boolean, boolean];
};

type RealBetRow = { id: string; slot: number; status: string; cashed_at: number | null; payout: number; stake: number };

/**
 * Aviator round loop for the player's account balance.
 * Bets, cash-outs and the crash point are settled by the backend; this hook only
 * drives the animation and mirrors the balance the backend reports back.
 */
export function useAviatorGame(realBalance: number | null = null) {
  const g = useRef<GameState>({
    phase: "waiting",
    phaseStart: 0,
    round: 1,
    crashPoint: 1,
    multiplier: 1,
    balance: 0,
    slots: [newSlot(1000), newSlot(500)],
    history: seedHistory(),
    myBets: [],
    simBets: [],
    topWins: [],
    realRoundId: null,
    realPending: false,
    cashing: [false, false],
  });
  const [, setTick] = useState(0);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const render = useCallback(() => setTick((t) => (t + 1) % 1_000_000), []);

  // Keep the balance in sync with the account
  useEffect(() => {
    if (realBalance !== null) {
      g.current.balance = realBalance;
      render();
    }
  }, [realBalance, render]);

  // The loop runs on animation frames, so it only starts after hydration.
  useEffect(() => {
    g.current.simBets = makeSimBets();
    g.current.phaseStart = performance.now();
    setHydrated(true);
    render();
    // Sync the client animation growth rate to the operator's formula setting.
    void supabase.rpc("public_get_formula").then(({ data }) => {
      const v = (data as { growth_per_ms?: number } | null)?.growth_per_ms;
      if (typeof v === "number" && v > 0) serverGrowthPerMs = v;
    });
  }, [render]);

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
      render();
      return true;
    },
    [render],
  );

  const cancelBet = useCallback(
    (i: 0 | 1) => {
      const s = g.current;
      const slot = s.slots[i];
      if (slot.status !== "queued") return;
      s.balance += slot.stake;
      slot.stake = 0;
      slot.status = "none";
      render();
    },
    [render],
  );

  const cashOut = useCallback(
    (i: 0 | 1) => {
      const s = g.current;
      const slot = s.slots[i];
      if (slot.status !== "active" || s.phase !== "flying") return;
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
        s.balance = Number(res.balance);
        recordBet({ id: `${round}-${i}`, round, stake, cashedAt: m, win, time: Date.now() });
        toast.success(`Cashed out at ${formatMult(m)}`, { description: `You won ${formatTsh(win)}` });
        if (slot.status === "active") {
          slot.status = "none";
          slot.stake = 0;
        }
        render();
      });
    },
    [recordBet, render],
  );

  const updateSlot = useCallback(
    (i: 0 | 1, patch: Partial<Slot>) => {
      Object.assign(g.current.slots[i], patch);
      render();
    },
    [render],
  );

  // The server decides the crash point; the client only learns it once the plane flies away.
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
              s.balance += sl.stake;
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
        s.balance = Number(res.balance);
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
        s.balance = Number(res.balance);
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
        if (s.slots.some((sl) => sl.status === "active")) {
          startRealRound();
        }
      } else if (s.phase === "flying") {
        const m = multiplierAtServer(elapsed);
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
        } else {
          s.multiplier = m;
          s.slots.forEach((slot, idx) => {
            if (slot.status === "active" && slot.autoCashout && m >= slot.autoCashoutAt && !s.realPending) {
              cashOut(idx as 0 | 1);
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
              toast.error(`Auto bet #${idx + 1} stopped: not enough balance.`);
            }
          }
        });
      }

      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hydrated, cashOut, placeBet, recordBet, startRealRound]);

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
  };
}

export type AviatorGame = ReturnType<typeof useAviatorGame>;
