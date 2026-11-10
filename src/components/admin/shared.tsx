import type { ReactNode } from "react";

export function Panel({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-display text-lg font-bold tabular-nums ${tone === "good" ? "text-tier-low" : tone === "bad" ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`rounded-xl bg-bet px-4 py-2 text-sm font-bold text-bet-foreground hover:brightness-110 disabled:opacity-60 ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-60 ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-bet" : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-foreground transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function hourLabel(h: number) {
  return `${String(h % 24).padStart(2, "0")}:00`;
}

export function toInt(v: string): number | null {
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? Math.round(n) : null;
}
