"use client";

import { useEffect, useState } from "react";
import { Eye, MousePointer, MailCheck } from "lucide-react";
import type { MessageStats } from "@/lib/email/postmarkStats";

/**
 * Haalt open/click-stats op voor een Postmark-message en toont een subtiele
 * rij met aantal opens + laatste keer geopend. Fallback als Postmark
 * niet geconfigureerd is of de call faalt: een simpel "verzonden" badge.
 */
export default function EmailStats({ messageId }: { messageId: string }) {
  const [stats, setStats] = useState<MessageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/email/stats?message_id=${encodeURIComponent(messageId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setStats(d?.stats || null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
        <MailCheck className="w-3 h-3" />
        Stats ophalen…
      </span>
    );
  }

  if (!stats) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
        <MailCheck className="w-3 h-3" />
        Verzonden
      </span>
    );
  }

  if (stats.status === "test") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-full px-2 py-0.5">
        <MailCheck className="w-3 h-3" />
        Verzonden (test-mode)
      </span>
    );
  }

  const lastOpened = stats.last_opened_at
    ? new Date(stats.last_opened_at).toLocaleString("nl-NL", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
        <MailCheck className="w-3 h-3" />
        Verzonden
      </span>
      {stats.opens > 0 ? (
        <span
          className="inline-flex items-center gap-1.5 text-[10px] text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5"
          title={
            lastOpened
              ? `Laatst geopend: ${lastOpened}`
              : "Geopend door ontvanger"
          }
        >
          <Eye className="w-3 h-3" />
          {stats.opens}× geopend
          {lastOpened ? ` · ${lastOpened}` : ""}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-full px-2 py-0.5">
          <Eye className="w-3 h-3" />
          Nog niet geopend
        </span>
      )}
      {stats.clicks > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5">
          <MousePointer className="w-3 h-3" />
          {stats.clicks}× geklikt
        </span>
      )}
    </div>
  );
}
