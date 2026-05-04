"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, X } from "lucide-react";

/**
 * HelpCard — collapsible "Hoe werkt dit?" box voor boven aan een pagina.
 *
 * Onthoud dismissal in localStorage per storageKey zodat ervaren gebruikers
 * 'm niet elke sessie opnieuw zien. "Toon uitleg" knop elders op de page
 * kan via `openHelpCard(key)` (global custom event) 'm weer openen.
 */
export interface HelpCardProps {
  /** Unieke key voor localStorage (bv. "help.decisions"). */
  storageKey: string;
  /** Kop boven de uitleg. */
  title: string;
  /** Optionele extra tag (b.v. pagina-naam). */
  tag?: string;
  /** Gestuurd open/dicht door de gebruiker. Default: open tenzij gedismissed. */
  children: React.ReactNode;
}

export default function HelpCard({ storageKey, title, tag, children }: HelpCardProps) {
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(true);

  // Hydrate uit localStorage bij mount zodat SSR-content gelijk is aan de eerste render.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "dismissed") setOpen(false);
    } catch { /* private mode etc */ }
    setHydrated(true);

    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (detail?.key === storageKey) {
        setOpen(true);
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      }
    }
    window.addEventListener("nova:open-help", onOpen);
    return () => window.removeEventListener("nova:open-help", onOpen);
  }, [storageKey]);

  function persist(state: "open" | "dismissed") {
    try {
      if (state === "dismissed") localStorage.setItem(storageKey, "dismissed");
      else localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }

  if (!hydrated) {
    // Toon tijdens hydration niets zodat SSR-HTML niet flasht
    return null;
  }

  // Collapsed state: kleine pill-knop waarmee je 'm weer opent.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); persist("open"); }}
        className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-zinc-300 px-2 py-1 rounded-md border border-dashed border-[var(--border)] hover:border-zinc-600 transition-colors"
        aria-expanded="false"
      >
        <BookOpen className="w-3 h-3" aria-hidden="true" />
        Toon uitleg
      </button>
    );
  }

  return (
    <section
      aria-label={title}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-4 h-4 text-[var(--accent)] flex-shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-zinc-200 truncate">{title}</h3>
          {tag && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 font-medium whitespace-nowrap">
              {tag}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => { setOpen(false); persist("open"); /* only hide for session */ }}
            aria-label="Uitleg inklappen"
            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300"
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); persist("dismissed"); }}
            aria-label="Uitleg permanent dismissen (heropen met 'Toon uitleg')"
            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-red-400"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="text-[12px] text-zinc-300 leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}

/**
 * Invisible marker — imports a collapse-arrow at the top-left of something.
 * Used in niet-gecollapseerde HelpCard is overbodig; behouden voor potentiele
 * inline-hints elders.
 */
export function CollapseHint() {
  return <ChevronRight className="w-3 h-3" aria-hidden="true" />;
}
