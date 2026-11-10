// Pure rules shared by the sign-up form and the admin panel. The database enforces the same rules.

/** Promo codes are stored upper-case without spaces; returns null for an empty/invalid code. */
export function normalizePromoCode(input: string): string | null {
  const c = input.trim().toUpperCase().replace(/\s+/g, "");
  if (c.length === 0) return null;
  if (!/^[A-Z0-9_-]{2,30}$/.test(c)) return null;
  return c;
}

/** Whether a time-of-day cap (start inclusive, end exclusive, may wrap past midnight) covers this hour. Matches the server. */
export function ruleAppliesAtHour(startHour: number, endHour: number, hour: number): boolean {
  if (startHour <= endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/** Current hour in Tanzania (Africa/Dar_es_Salaam, UTC+3, no daylight saving). */
export function tanzaniaHour(now: Date = new Date()): number {
  return (now.getUTCHours() + 3) % 24;
}

/** House edge entered as a percent (e.g. "3") → fraction 0.03. Allowed 0% to 50%. */
export function parseHouseEdgePercent(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || input.trim() === "" || n < 0 || n > 50) return null;
  return Math.round(n * 100) / 10000;
}
