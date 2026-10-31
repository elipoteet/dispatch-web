import type { Metadata } from "next";

// A tab that doesn't exist for this security — Financials for a fund, say.
// Rendered inside the company's own layout, so the header and tabs stay put.
// (An unknown ticker is handled one level up, in app/research/not-found.tsx.)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TabNotFound() {
  return (
    <div className="rf-tab-body">
      <p className="rf-note">
        This section isn&rsquo;t available for this security. It doesn&rsquo;t file company reports with the SEC, so there are no
        financial statements to show. Its price is on the Overview tab above.
      </p>
    </div>
  );
}
