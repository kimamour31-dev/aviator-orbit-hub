import { describe, expect, it } from "vitest";
import { crashPointFrom, multiplierAt, payout, validateBet } from "./aviator";

describe("bet validation", () => {
  it("rejects a bet of 0 TSh", () => {
    expect(validateBet(0, 10000).ok).toBe(false);
  });
  it("rejects a bet larger than the balance", () => {
    expect(validateBet(5001, 5000).ok).toBe(false);
  });
  it("accepts a 1,000 TSh bet with 10,000 TSh balance", () => {
    expect(validateBet(1000, 10000).ok).toBe(true);
  });
});

describe("payout", () => {
  it("pays stake times multiplier", () => {
    expect(payout(1000, 2.5)).toBe(2500);
  });
  it("rounds down to whole TSh", () => {
    expect(payout(500, 1.777)).toBe(885);
  });
});

describe("crash point (99% RTP)", () => {
  it("crashes instantly at 1.00x for the lowest 1% of rolls", () => {
    expect(crashPointFrom(0)).toBe(1);
  });
  it("gives 1.98x for a roll of 0.5", () => {
    expect(crashPointFrom(0.5)).toBe(1.98);
  });
  it("starts the flight at 1.00x", () => {
    expect(multiplierAt(0)).toBe(1);
  });
});
