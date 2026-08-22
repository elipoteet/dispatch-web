import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ProfileNotFound() {
  return (
    <div className="social-empty" style={{ padding: "60px 0" }}>
      No one has that handle.
    </div>
  );
}
