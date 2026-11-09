// Pure game rules for the Aviator crash game (play-money demo).

/** Share of every stake returned to players on average. 0.99 => 99% RTP. */
export const RTP = 0.99;
/** Multiplier growth rate per millisecond of flight: m(t) = e^(k·t). */
export const GROWTH_PER_MS = 0.00008;
export const WAITING_MS = 6000;
export const CRASHED_MS = 3500;
export const STARTING_BALANCE = 10000;

/**
 * Crash point from a uniform random number r in [0, 1).
 * P(crash >= x) = RTP / x, so cashing out at any target returns RTP on average.
 */
export function crashPointFrom(r: number): number {
  const raw = RTP / (1 - r);
  if (raw < 1) return 1;
  return Math.floor(raw * 100) / 100;
}

export function randomCrashPoint(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return crashPointFrom((buf[0] ?? 0) / 2 ** 32);
}

export function multiplierAt(elapsedMs: number): number {
  return Math.exp(GROWTH_PER_MS * Math.max(0, elapsedMs));
}

export function msForMultiplier(m: number): number {
  return Math.log(Math.max(1, m)) / GROWTH_PER_MS;
}

/** Winnings in whole TSh, rounded down. */
export function payout(stake: number, multiplier: number): number {
  return Math.floor(stake * Math.floor(multiplier * 100) / 100);
}

export type BetCheck = { ok: true } | { ok: false; reason: string };

export function validateBet(amount: number, balance: number): BetCheck {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Place a bet greater than 0 TSh." };
  }
  if (amount > balance) {
    return { ok: false, reason: "Not enough demo credits for this bet." };
  }
  return { ok: true };
}

export type Tier = "low" | "mid" | "high";
export function tierOf(m: number): Tier {
  if (m < 2) return "low";
  if (m < 10) return "mid";
  return "high";
}

export function formatTsh(n: number): string {
  return `${Math.floor(n).toLocaleString("en-US")} TSh`;
}

export function formatMult(m: number): string {
  return `${(Math.floor(m * 100) / 100).toFixed(2)}x`;
}
