import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuthForPayments } from "@/integrations/supabase/require-auth";
import { checkDeposit, toHarakaPayPhone } from "./deposit";
import { collect, syncOrder, walletBalance } from "./harakapay.server";

function webhookUrl(): string | undefined {
  try {
    const url = new URL(getRequest().url);
    if (url.hostname === "localhost" || url.hostname.startsWith("127.")) return undefined;
    return `${url.protocol}//${url.host}/api/public/harakapay-webhook`;
  } catch {
    return undefined;
  }
}

/** Creates the deposit and sends the mobile money PIN prompt to the player's phone. */
export const startHarakaPayDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthForPayments])
  .inputValidator((d) => z.object({ network: z.string().max(20), phone: z.string().max(20), amount: z.string().max(12) }).parse(d))
  .handler(async ({ data, context }) => {
    const check = checkDeposit(data.network, data.phone, data.amount);
    if (!check.ok) return { ok: false as const, error: check.error };

    const { data: id, error } = await context.supabase.rpc("request_deposit", {
      _network: data.network,
      _phone: check.phone,
      _amount: check.amount,
    });
    if (error || !id) return { ok: false as const, error: error?.message ?? "Could not create the deposit" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const res = await collect({
        phone: toHarakaPayPhone(check.phone),
        amount: check.amount,
        description: "Omuh bet deposit",
        ...(webhookUrl() ? { webhook_url: webhookUrl() } : {}),
      });
      if (!res.success || !res.order_id) throw new Error(res.error ?? res.message ?? "HarakaPay did not accept the payment");
      await supabaseAdmin
        .from("deposit_requests")
        .update({ provider: "harakapay", provider_order_id: res.order_id })
        .eq("id", id);
      return { ok: true as const, id: String(id), amount: check.amount };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "HarakaPay is unavailable";
      await supabaseAdmin
        .from("deposit_requests")
        .update({ status: "rejected", admin_note: `PIN prompt not sent: ${msg}`.slice(0, 200), reviewed_at: new Date().toISOString() })
        .eq("id", id);
      return { ok: false as const, error: `Couldn't send the payment prompt: ${msg}` };
    }
  });

/** Checks a HarakaPay deposit with HarakaPay and credits it once paid. Players can check their own; admins any. */
export const checkHarakaPayDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthForPayments])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: players only see their own deposits, admins see all.
    const { data: row } = await context.supabase
      .from("deposit_requests")
      .select("status, provider, provider_order_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { status: "not_found" };
    if (row.provider !== "harakapay" || !row.provider_order_id || row.status === "approved") return { status: row.status };
    try {
      const status = await syncOrder(row.provider_order_id);
      return { status: status === "pending" ? row.status : status };
    } catch {
      return { status: row.status };
    }
  });

/** Admin only: the operator's HarakaPay wallet balance. */
export const getHarakaPayBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuthForPayments])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    try {
      const b = await walletBalance();
      return { ok: true as const, wallet: Number(b.wallet_balance), float: Number(b.float_balance) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "HarakaPay is unavailable" };
    }
  });
