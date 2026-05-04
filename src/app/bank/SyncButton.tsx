"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncButton({
  bankAccountId,
}: {
  bankAccountId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch(
        `/api/bank/${bankAccountId}/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Sync mislukt");
        return;
      }
      setMsg(
        `${d.inserted} nieuw, ${d.auto_matched} auto-matched`,
      );
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded disabled:opacity-40"
      >
        <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
        Sync
      </button>
      {msg && <span className="text-xs text-emerald-400">{msg}</span>}
      {err && <span className="text-xs text-red-300">{err}</span>}
    </div>
  );
}
