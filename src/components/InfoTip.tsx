"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * InfoTip — minimale tooltip primitive voor uitleg bij stats en charts.
 *
 * Drie triggers (allemaal tegelijk actief):
 *   - hover op de indicator  → open
 *   - focus via Tab          → open
 *   - klik / Enter / Space   → toggle (mobile / sticky inspectie)
 *
 * Positionering via Floating UI zou overkill zijn; we gebruiken een absolute
 * bubble onder/boven de trigger met automatische keerzijde-detectie wanneer
 * er geen ruimte onder is. Escape of click-outside sluit de tip weer.
 *
 * Toegankelijkheid:
 *   - trigger heeft aria-describedby wanneer open (screen readers lezen voor)
 *   - role="tooltip" op de bubble zelf
 *   - Escape sluit; focus keert terug naar de trigger
 */
export interface InfoTipProps {
  /** Accessible label op de icon-button (bv. "Uitleg R-multiple"). */
  label: string;
  /** Tooltip-inhoud. Kan string zijn of rich JSX. */
  children: React.ReactNode;
  /** Voorkeur boven vs onder. Default "bottom" met auto-flip. */
  placement?: "top" | "bottom";
  /** Custom trigger-element ipv het standaard info-icoontje. */
  anchor?: React.ReactNode;
  className?: string;
}

export default function InfoTip({
  label,
  children,
  placement = "bottom",
  anchor,
  className = "",
}: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState<"top" | "bottom">(placement);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  // Auto-flip wanneer er onvoldoende ruimte onder (of boven) is.
  useEffect(() => {
    if (!open) return;
    const bubble = bubbleRef.current;
    const wrapper = wrapperRef.current;
    if (!bubble || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const bubbleH = bubble.offsetHeight;
    const vh = window.innerHeight;
    if (placement === "bottom" && rect.bottom + bubbleH + 12 > vh) {
      setFlip("top");
    } else if (placement === "top" && rect.top - bubbleH - 12 < 0) {
      setFlip("bottom");
    } else {
      setFlip(placement);
    }
  }, [open, placement]);

  // Escape + click-outside sluiten de tip.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        (wrapperRef.current?.querySelector("button") as HTMLElement | null)?.focus();
      }
    }
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-zinc-500 hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
      >
        {anchor ?? <Info className="w-3 h-3" aria-hidden="true" />}
      </button>
      {open && (
        <span
          ref={bubbleRef}
          role="tooltip"
          id={id}
          className={`absolute z-50 left-1/2 -translate-x-1/2 ${
            flip === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"
          } w-max max-w-[280px] px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] text-[11px] leading-relaxed text-zinc-200 shadow-lg pointer-events-none`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
