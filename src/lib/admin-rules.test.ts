import { describe, expect, it } from "vitest";
import { normalizePromoCode, parseHouseEdgePercent, ruleAppliesAtHour, tanzaniaHour } from "./admin-rules";

describe("normalizePromoCode", () => {
  it("upper-cases and trims", () => expect(normalizePromoCode("  welcome10 ")).toBe("WELCOME10"));
  it("treats empty as no code", () => expect(normalizePromoCode("   ")).toBeNull());
  it("rejects symbols", () => expect(normalizePromoCode("hi!@#")).toBeNull());
});

describe("ruleAppliesAtHour", () => {
  it("covers 18:00 in an 18–22 window", () => expect(ruleAppliesAtHour(18, 22, 18)).toBe(true));
  it("excludes 22:00 in an 18–22 window", () => expect(ruleAppliesAtHour(18, 22, 22)).toBe(false));
  it("wraps past midnight for 22–6", () => expect(ruleAppliesAtHour(22, 6, 2)).toBe(true));
  it("does not cover noon for 22–6", () => expect(ruleAppliesAtHour(22, 6, 12)).toBe(false));
});

describe("tanzaniaHour", () => {
  it("is UTC+3", () => expect(tanzaniaHour(new Date("2026-11-10T22:30:00Z"))).toBe(1));
});

describe("parseHouseEdgePercent", () => {
  it("turns 3% into 0.03", () => expect(parseHouseEdgePercent("3")).toBe(0.03));
  it("rejects above 50%", () => expect(parseHouseEdgePercent("60")).toBeNull());
  it("rejects negatives", () => expect(parseHouseEdgePercent("-1")).toBeNull());
});
