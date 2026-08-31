import type { Metadata } from "next";

// title is explicit — see app/(social)/p/[id]/not-found.tsx's comment on
// the doubled-title bug an omitted title produced live.
export const metadata: Metadata = {
  title: "Profile Not Found",
  robots: { index: false, follow: false },
};

export default function ProfileNotFound() {
  return (
    <div className="social-empty" style={{ padding: "60px 0" }}>
      No one has that handle.
    </div>
  );
}
