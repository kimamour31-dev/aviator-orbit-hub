```typescript
// Server-only HarakaPay helpers.
// Supports direct HarakaPay API (Vercel) and Lovable connector gateway.

import { harakaPayOutcome } from "./deposit";

const HARAKAPAY_BASE_URL = "https://harakapay.net";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_harakapay";

type Provider = "direct" | "gateway";

function getProvider(): Provider {
  return process.env.HARAKAPAY_API_KEY ? "direct" : "gateway";
}

function headers(provider: Provider): Record<string, string> {
  if (provider === "direct") {
    const apiKey = process.env.HARAKAPAY_API_KEY;

    if (!apiKey) {
      throw new Error("HARAKAPAY_API_KEY is missing");
    }

    return {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    };
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.UDC_HARAKAPAY_API_KEY;

  if (!lovableKey || !connKey) {
    throw new Error("HarakaPay is not connected");
  }

  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    "Content-Type": "application/json",
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const provider = getProvider();

  const baseUrl =
    provider === "direct" ? HARAKAPAY_BASE_URL : GATEWAY_URL;

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...headers(provider),
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(
      `HarakaPay ${provider} ${path} failed [${res.status}]: ${text}`,
    );

    let message = "";

    try {
      const j = JSON.parse(text) as {
        error?: string;
        message?: string;
      };

      message = j.error ?? j.message ?? "";
    } catch {
      // Non-JSON error response
    }

    throw new Error(message || `HarakaPay request failed (${res.status})`);
  }

  if (!text) return {} as T;

  return JSON.parse(text) as T;
}

export type CollectResult = {
  success: boolean;
  message?: string;
  error?: string;
  order_id?: string;
  amount?: number;
  net_amount?: number;
  fee?: number;
};

export type StatusResult = {
  success: boolean;
  error?: string;
  payment?: {
    order_id: string;
    status: string;
    amount: number;
    net_amount?: number;
    fee_amount?: number;
  };
};

export function collect(body: {
  phone: string;
  amount: number;
  description: string;
  webhook_url?: string;
}) {
  return call<CollectResult>("/api/v1/collect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function paymentStatus(orderId: string) {
  return call<StatusResult>(
    `/api/v1/status/${encodeURIComponent(orderId)}`,
  );
}

export function walletBalance() {
  return call<{
    success: boolean;
    wallet_balance: number;
    float_balance: number;
  }>("/api/v1/balance");
}

/**
 * Verify payment directly with HarakaPay before settling.
 * Never trusts payment status submitted by the client.
 */
export async function syncOrder(orderId: string): Promise<string> {
  const s = await paymentStatus(orderId);
  const p = s.payment;

  if (!s.success || !p) return "pending";

  const outcome = harakaPayOutcome(p.status);

  if (outcome === "wait") return "pending";

  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  const { data, error } = await supabaseAdmin.rpc(
    "settle_harakapay_deposit",
    {
      _order_id: p.order_id,
      _status: p.status,
      _fee: Math.round(Number(p.fee_amount ?? 0)),
      _net: Math.round(Number(p.net_amount ?? 0)),
    },
  );

  if (error) {
    console.error("settle_harakapay_deposit failed", error);
    throw new Error("Could not update the deposit");
  }

  return String(data);
}
```
