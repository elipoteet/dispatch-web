"use client";

import { useAuthModal } from "@/components/auth/AuthModalContext";

export function BeginButton() {
  const { open } = useAuthModal();
  return (
    <button type="button" onClick={() => open("sign-up")}>
      Begin
    </button>
  );
}
