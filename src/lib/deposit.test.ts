import { describe, expect, it } from "vitest";
import { checkDeposit } from "./deposit";

describe("checkDeposit", () => {
  it("accepts a valid M-Pesa deposit of 5,000 TSh", () => {
    expect(checkDeposit("mpesa", "0712345678", "5000")).toEqual({ ok: true, phone: "255712345678", amount: 5000 });
  });
  it("requires a network", () => {
    expect(checkDeposit(null, "0712345678", "5000").ok).toBe(false);
  });
  it("rejects amounts below 1,000 TSh", () => {
    expect(checkDeposit("tigo", "0654123456", "999").ok).toBe(false);
    expect(checkDeposit("tigo", "0654123456", "1000").ok).toBe(true);
  });
  it("rejects amounts above 10,000,000 TSh", () => {
    expect(checkDeposit("airtel", "0754123456", "10000001").ok).toBe(false);
  });
  it("rejects a non-Tanzanian number", () => {
    expect(checkDeposit("halopesa", "0512345678", "5000").ok).toBe(false);
  });
});
