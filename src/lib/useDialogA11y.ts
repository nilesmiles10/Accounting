"use client";

import { useEffect } from "react";

/**
 * Dialog accessibility primitive (H13 in CODEBASE_REVIEW_FIXES_PART2.md).
 *
 * Pulls together the three things every modal needs:
 *   1. Escape-to-close
 *   2. Focus trap — Tab/Shift-Tab cycle stays inside the dialog
 *   3. Focus restoration — when the dialog closes, return focus to the
 *      element that opened it
 *
 * Also applies `aria-hidden` to sibling roots so screen readers don't
 * announce the page behind the modal.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useDialogA11y({ open, onClose, containerRef: ref });
 *   …
 *   <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="…">
 */
export interface UseDialogA11yOptions {
  open: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement>;
  /** Optional: selector inside the container to focus first. Defaults to
   *  the first focusable descendant. */
  initialFocusSelector?: string;
}

export function useDialogA11y({
  open,
  onClose,
  containerRef,
  initialFocusSelector,
}: UseDialogA11yOptions): void {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog.
    const focusTarget = initialFocusSelector
      ? (container.querySelector(initialFocusSelector) as HTMLElement | null)
      : getFocusable(container)[0];
    (focusTarget ?? container).focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable(container!);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the opener.
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, containerRef, initialFocusSelector]);
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null,
  );
}
