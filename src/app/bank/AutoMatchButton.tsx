"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";

export default function AutoMatchButton({
  accountId,
  className,
}: {
  accountId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    matched: number;
    skipped: number;
  } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const url = accountId
        ? `/api/bank/auto-match?account=${accountId}`
        : `/api/bank/auto-match`;
      const r = await fetch(url, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setResult(d);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className || ""}`}>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg disabled:opacity-40"
        title="Loopt opnieuw door alle unmatched transacties en koppelt automatisch waar bedrag + factuurnummer matchen"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {busy ? "Matchen..." : "Auto-match draaien"}
      </button>
      {result && (
        <span
          className={`text-xs ${
            result.matched > 0 ? "text-emerald-400" : "text-zinc-500"
          }`}
        >
          {result.matched > 0
            ? `✓ ${result.matched} gematched`
            : `Geen nieuwe matches (${result.skipped} blijven open)`}
        </span>
      )}
    </div>
  );
}
