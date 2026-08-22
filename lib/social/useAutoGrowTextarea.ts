"use client";

import { useEffect, useRef } from "react";

// Grows a textarea to fit its content instead of staying a fixed number of
// rows — re-measures whenever `value` changes. Shared by Composer,
// ReplyBox, and the inline post-edit form.
export function useAutoGrowTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
