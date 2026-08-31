import type { Metadata } from "next";
import { EmptyState } from "@/components/social/EmptyState";

// Set noindex explicitly rather than relying on Next's automatic
// injection for notFound() — verified empirically in the retired page's
// own comment that it doesn't reliably apply once a custom not-found.tsx
// exists for the segment; same fix carried over here.
//
// title is explicit too — see app/(social)/p/[id]/not-found.tsx's
// comment on the doubled-title bug an omitted title produced live.
export const metadata: Metadata = {
  title: "Ticker Not Found",
  robots: { index: false, follow: false },
};

export default function TickerNotFound() {
  return (
    <div className="social-content-card">
      <EmptyState
        headline="We couldn't find that ticker."
        sub="Double-check that it's a valid, U.S.-listed symbol — try the exact exchange ticker (e.g. AAPL, MSFT, NVDA) rather than a company name."
      />
    </div>
  );
}
