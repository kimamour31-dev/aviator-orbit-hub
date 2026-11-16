// Server-only HarakaPay helpers. Calls go through the connector gateway, which adds the HarakaPay API key.
import { harakaPayOutcome } from "./deposit";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_harakapay";

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["UDC_HARAKAPAY_API_KEY"];
  if (!lovableKey || !connKey) throw new Error("HarakaPay is not connected");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    "Content-Type": "application/json",
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: headers() });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HarakaPay ${path} failed [${res.status}]: ${text}`);
    let msg = "";
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      msg = j.error ?? j.message ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(msg || `HarakaPay request failed (${res.status})`);
  }
  return JSON.parse(text) as T;
}

export type CollectResult = { success: boolean; message?: string; error?: string; order_id?: string; amount?: number; net_amount?: number; fee?: number };
export type StatusResult = {
  success: boolean;
  error?: string;
  payment?: { order_id: string; status: string; amount: number; net_amount?: number; fee_amount?: number };
};

export function collect(body: { phone: string; amount: number; description: string; webhook_url?: string | undefined }) {
  return call<CollectResult>("/api/v1/collect", { method: "POST", body: JSON.stringify(body) });
}

export function paymentStatus(orderId: string) {
  return call<StatusResult>(`/api/v1/status/${encodeURIComponent(orderId)}`);
}

export function walletBalance() {
  return call<{ success: boolean; wallet_balance: number; float_balance: number }>("/api/v1/balance");
}

/** Asks HarakaPay for the real status of an order (never trusts what a caller sends) and settles the deposit. */
export async function syncOrder(orderId: string): Promise<string> {
  const s = await paymentStatus(orderId);
  const p = s.payment;
  if (!s.success || !p) return "pending";
  if (harakaPayOutcome(p.status) === "wait") return "pending";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("settle_harakapay_deposit", {
    _order_id: p.order_id,
    _status: p.status,
    _fee: Math.round(Number(p.fee_amount ?? 0)),
    _net: Math.round(Number(p.net_amount ?? 0)),
  });
  if (error) {
    console.error("settle_harakapay_deposit failed", error);
    throw new Error("Could not update the deposit");
  }
  return String(data);
}
