import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatTsh } from "@/lib/aviator";
import { formatPhone } from "@/lib/phone";
import { GhostButton, Panel } from "./shared";

type LedgerRow = {
  kind: string;
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  phone: string | null;
  display_name: string | null;
  details: Record<string, unknown>;
};

const KINDS = [
  { value: "", label: "All entries" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "adjustment", label: "Adjustments" },
  { value: "payout", label: "Payouts" },
];

const KIND_TONE: Record<string, string> = {
  deposit: "bg-tier-low/15 text-tier-low",
  withdrawal: "bg-gold/15 text-gold",
  adjustment: "bg-primary/15 text-primary",
  payout: "bg-bet/15 text-bet",
};

const PAGE_SIZE = 50;

function describe(row: LedgerRow): string {
  const d = row.details;
  const num = (k: string) => Number(d[k] ?? 0);
  switch (row.kind) {
    case "deposit":
      return `${String(d.network ?? "")}${d.provider === "harakapay" ? " · HarakaPay" : ""}${d.note ? ` · ${String(d.note)}` : ""}`;
    case "withdrawal":
      return `${String(d.network ?? "")}${d.reference ? ` · ref ${String(d.reference)}` : ""}${d.note ? ` · ${String(d.note)}` : ""}`;
    case "adjustment":
      return String(d.note ?? "");
    case "payout":
      return `Stake ${formatTsh(num("stake"))} · cashed at ${Number(d.cashed_at ?? 0).toFixed(2)}x`;
    default:
      return "";
  }
}

export function AdminLedger() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_ledger", { _limit: PAGE_SIZE, _offset: offset, _kind: kind });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as LedgerRow[]);
  }, [offset, kind]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    const header = ["Date", "Type", "Player", "Phone", "Amount (TSh)", "Status", "Details"];
    const lines = rows.map((r) => [
      new Date(r.created_at).toISOString(),
      r.kind,
      r.display_name ?? "",
      r.phone ?? "",
      String(r.amount),
      r.status,
      describe(r).replace(/,/g, ";"),
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <Panel
      title="Transaction ledger"
      description="Every money movement in one place — deposits, withdrawals, balance adjustments, and bet payouts."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => { setKind(e.target.value); setOffset(0); }}
            className="auth-input h-8 w-36 text-xs"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <GhostButton onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
          <GhostButton onClick={exportCsv} className="gap-1.5" disabled={rows.length === 0}>
            <Download className="size-3.5" /> CSV
          </GhostButton>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No transactions yet."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-3 font-bold">Type</th>
                <th className="py-2 pr-3 font-bold">Player</th>
                <th className="py-2 pr-3 font-bold">Amount</th>
                <th className="py-2 pr-3 font-bold">Status</th>
                <th className="py-2 pr-3 font-bold">Details</th>
                <th className="py-2 font-bold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${KIND_TONE[r.kind] ?? "bg-muted text-muted-foreground"}`}>
                      {r.kind}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-foreground">
                    {r.display_name || (r.phone ? formatPhone(r.phone) : "—")}
                  </td>
                  <td className="py-2 pr-3 font-bold tabular-nums text-foreground">{formatTsh(Number(r.amount))}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.status}</td>
                  <td className="py-2 pr-3 max-w-xs truncate text-muted-foreground">{describe(r) || "—"}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <GhostButton disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Newer</GhostButton>
        <span className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + rows.length}</span>
        <GhostButton disabled={rows.length < PAGE_SIZE} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Older</GhostButton>
      </div>
    </Panel>
  );
}
