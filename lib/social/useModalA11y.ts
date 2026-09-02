"use client";

import { useEffect, useRef } from "react";

// docs/phase-four.md Part 2's "modals behave": Escape closes them, focus
// moves into them on open and returns to whatever triggered them on
// close, the page behind doesn't scroll, and focus is trapped inside
// while open. Backdrop-click-to-close is handled separately by each
// modal's own onClick (it already existed before this pass and needs the
// actual click target, which this hook doesn't have).
//
// Returns a ref to put on the modal's outer container — give that
// container `tabIndex={-1}` so it's programmatically focusable without
// joining the page's normal tab order.
//
// Full Tab-cycle trap added for docs/invite-modal-build-brief.md, which
// explicitly requires "focus moves into the modal on open and is
// trapped" — this hook's own prior version only did entry/exit focus and
// said as much in its own comment ("worth revisiting if this pattern
// spreads to more than the one modal this app has right now"). It just
// did (InviteModal.tsx), so this is additive here rather than a second,
// slightly-different hook — PromoteAction.tsx (the only other caller)
// gets a real trap for free too.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null, // skip anything hidden (e.g. a display:none state not currently shown)
      );
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Wrap at the ends rather than a full re-scan on every keystroke —
      // the only two cases that need handling are "Tab past the last
      // element" and "Shift+Tab past the first," everything in between is
      // already normal native tab order within the container.
      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  return containerRef;
}
