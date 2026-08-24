"use client";

import { useEffect, useRef } from "react";

// docs/phase-four.md Part 2's "modals behave": Escape closes them, focus
// moves into them on open and returns to whatever triggered them on
// close, and the page behind doesn't scroll. Backdrop-click-to-close is
// handled separately by each modal's own onClick (it already existed
// before this pass and needs the actual click target, which this hook
// doesn't have).
//
// Returns a ref to put on the modal's outer container — give that
// container `tabIndex={-1}` so it's programmatically focusable without
// joining the page's normal tab order. Does NOT implement a full Tab-cycle
// focus trap (only entry/exit focus) — worth revisiting if this pattern
// spreads to more than the one modal this app has right now.
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
      if (e.key === "Escape") onClose();
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
