import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/omuh360-aviator-logo.jpeg.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTzPhone, phoneToAuthEmail } from "@/lib/phone";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — OMUH 360 Aviator" },
      { name: "description", content: "Sign in or create your OMUH 360 Aviator account with your phone number and password." },
      { property: "og:title", content: "Sign in — OMUH 360 Aviator" },
      { property: "og:description", content: "Create an account with your phone number to play in Real mode." },
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
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTzPhone(phone);
    if (!normalized) return toast.error("Enter a valid Tanzanian mobile number, e.g. 0712 345 678");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const email = phoneToAuthEmail(normalized);
    const { error } =
      tab === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: { data: { phone: normalized, display_name: name || null }, emailRedirectTo: window.location.origin },
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
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <Link to="/" className="mb-5 flex items-center gap-2.5">
          <img src={logo.url} alt="OMUH 360 Aviator logo" className="size-10 rounded-xl" />
          <span className="font-display text-lg font-extrabold text-foreground">
            OMUH <span className="text-gold">360</span>
          </span>
        </Link>
        <div className="mb-5 flex rounded-full bg-muted p-0.5 text-sm font-semibold">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
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
          <button disabled={busy} className="w-full rounded-xl bg-bet py-2.5 font-bold text-bet-foreground hover:brightness-110 disabled:opacity-60">
            {busy ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Back to the game</Link> · Demo mode needs no account.
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
