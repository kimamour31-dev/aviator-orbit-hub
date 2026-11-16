import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// HarakaPay posts here when a payment completes or fails. HarakaPay doesn't sign these messages,
// so the body is only used for the order number — the real status is fetched from HarakaPay itself.
const Body = z.object({ order_id: z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const Route = createFileRoute("/api/public/harakapay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.safeParse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        try {
          const { syncOrder } = await import("@/lib/harakapay.server");
          await syncOrder(parsed.data.order_id);
        } catch (e) {
          console.error("HarakaPay webhook failed", e);
        }
        return new Response("ok");
      },
    },
  },
});
