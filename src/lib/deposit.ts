// Deposit request rules shared by the cashier window. The database function request_deposit enforces the same limits.
import { normalizeTzPhone } from "./phone";

export const DEPOSIT_MIN = 1_000;
export const DEPOSIT_MAX = 10_000_000;
export const DEPOSIT_PRESETS = [1_000, 2_500, 5_000, 10_000] as const;

export const NETWORKS = [
  { id: "mpesa", label: "M-PESA" },
  { id: "tigo", label: "tigo" },
  { id: "airtel", label: "airtel" },
  { id: "halopesa", label: "HaloPesa" },
] as const;
export type NetworkId = (typeof NETWORKS)[number]["id"];

export type DepositCheck = { ok: true; phone: string; amount: number } | { ok: false; error: string };

export function checkDeposit(network: string | null, phoneInput: string, amountInput: string): DepositCheck {
  if (!network || !NETWORKS.some((n) => n.id === network)) return { ok: false, error: "Choose your mobile money network." };
  const phone = normalizeTzPhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a valid Tanzanian mobile number, e.g. 0712345678." };
  const amount = Number(amountInput.replace(/[,\s]/g, ""));
  if (!Number.isInteger(amount) || amountInput.trim() === "") return { ok: false, error: "Enter a whole amount in TSh." };
  if (amount < DEPOSIT_MIN) return { ok: false, error: "Minimum deposit is 1,000 TSh." };
  if (amount > DEPOSIT_MAX) return { ok: false, error: "Maximum deposit is 10,000,000 TSh." };
  return { ok: true, phone, amount };
}
