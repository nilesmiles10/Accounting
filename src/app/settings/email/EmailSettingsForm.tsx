"use client";

import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";

interface Props {
  initialHasToken: boolean;
  initialTokenPreview: string;
  initialTestMode: boolean;
}

export default function EmailSettingsForm({
  initialHasToken,
  initialTokenPreview,
  initialTestMode,
}: Props) {
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(initialHasToken);
  const [tokenPreview, setTokenPreview] = useState(initialTokenPreview);
  const [showToken, setShowToken] = useState(false);
  const [testMode, setTestMode] = useState(initialTestMode);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function onSave() {
    setError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = { test_mode: testMode };
      if (token.trim()) body.postmark_server_token = token.trim();
      const res = await fetch("/api/settings/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Opslaan mislukt");
        return;
      }
      setSavedAt(Date.now());
      if (token.trim()) {
        setHasToken(true);
        setTokenPreview(
          token.trim().length > 8
            ? `${"•".repeat(token.trim().length - 4)}${token.trim().slice(-4)}`
            : "•".repeat(token.trim().length),
        );
        setToken("");
      }
    } catch {
      setError("Verbindingsfout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">
          Postmark Server API Token
        </label>
        {hasToken && !token && (
          <p className="text-xs text-zinc-400 mb-2 font-mono">
            Huidig: {tokenPreview}{" "}
            <span className="text-zinc-600">(laat leeg om te behouden)</span>
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={hasToken ? "Nieuwe token invullen om te vervangen" : "Plak hier je Server API Token"}
              autoComplete="off"
              className="w-full pr-10 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
              aria-label={showToken ? "Verbergen" : "Tonen"}
            >
              {showToken ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          Te vinden in Postmark bij Server → API Tokens → Server API tokens.
          Start doorgaans met &quot;POSTMARK_API_TEST&quot; of een UUID-achtige string.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={testMode}
          onChange={(e) => setTestMode(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Testmodus</span>
          <span className="block text-[11px] text-zinc-500 mt-0.5">
            Verstuur niet echt; log alleen het verzoek. Handig tijdens setup
            of als Postmark-token nog niet volledig werkt.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
        >
          <Check className="w-4 h-4" />
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-400">Opgeslagen</span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </section>
  );
}
