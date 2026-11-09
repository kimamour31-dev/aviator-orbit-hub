import { describe, expect, it } from "vitest";
import { normalizeTzPhone, phoneToAuthEmail } from "./phone";

describe("normalizeTzPhone", () => {
  it("accepts local 07 format", () => expect(normalizeTzPhone("0712 345 678")).toBe("255712345678"));
  it("accepts +255 format", () => expect(normalizeTzPhone("+255 654 321 000")).toBe("255654321000"));
  it("rejects too short numbers", () => expect(normalizeTzPhone("07123")).toBeNull());
  it("rejects non-mobile prefixes", () => expect(normalizeTzPhone("0222123456")).toBeNull());
  it("maps to an internal sign-in address", () => expect(phoneToAuthEmail("255712345678")).toBe("255712345678@phone.omuh360.app"));
});
