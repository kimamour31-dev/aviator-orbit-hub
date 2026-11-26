import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTzPhone, phoneToAuthEmail } from "@/lib/phone";
import { normalizePromoCode } from "@/lib/admin-rules";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Omuh bet Aviator" },
      { name: "description", content: "Sign in or create your Omuh bet account with your phone number and password." },
      { property: "og:title", content: "Sign in — Omuh bet Aviator" },
      { property: "og:description", content: "Create an account with your phone number to play Aviator." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTzPhone(phone);
    if (!normalized) { toast.error("Enter a valid Tanzanian mobile number, e.g. 0712 345 678"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    let promo: string | null = null;
    if (tab === "signup" && promoInput.trim()) {
      promo = normalizePromoCode(promoInput);
      if (!promo) { toast.error("That promo code doesn't look right. Check it or leave the field empty."); return; }
    }
    setBusy(true);
    if (promo) {
      const { data: ok } = await supabase.rpc("check_promo_code", { _code: promo });
      if (!ok) {
        setBusy(false);
        toast.error("This promo code is not valid or has expired. Check it or leave the field empty.");
        return;
      }
    }
    const email = phoneToAuthEmail(normalized);
    const { error } =
      tab === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: { data: { phone: normalized, display_name: name || null, promo_code: promo }, emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("Invalid login") ? "Wrong phone number or password" : error.message.includes("already registered") ? "This phone number already has an account" : error.message,
      );
      return;
    }
    toast.success(tab === "signup" ? "Account created" : "Welcome back");
    if (tab === "signin") void supabase.rpc("log_sign_in");
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <Link to="/" className="mb-5 flex items-center gap-2.5">
          <img src="/favicon.png" alt="Omuh bet logo" className="size-10 rounded-lg" />
          <span className="font-display text-lg font-extrabold uppercase tracking-tight text-foreground">
            Omuh<span className="text-primary"> bet</span>
          </span>
        </Link>
        <div className="mb-5 flex rounded-lg bg-muted p-0.5 text-sm font-semibold">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t === "signin" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          {tab === "signup" && (
            <Field label="Name (optional)">
              <input value={name} onChange={(e) => setName(e.target.value)} className="auth-input" maxLength={40} />
            </Field>
          )}
          <Field label="Phone number">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0712 345 678" className="auth-input" required />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" required />
          </Field>
          {tab === "signup" && (
            <Field label="Promo code (if you have one)">
              <input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME"
                className="auth-input uppercase"
                maxLength={30}
                autoCapitalize="characters"
              />
            </Field>
          )}
          <button disabled={busy} className="w-full rounded-lg bg-bet py-2.5 font-extrabold uppercase tracking-wide text-bet-foreground hover:brightness-110 disabled:opacity-60">
            {busy ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Back to the game</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
