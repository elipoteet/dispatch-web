import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer",
  robots: { index: false, follow: false },
  alternates: { canonical: "/disclaimer" },
};

// Full text from docs/legal-and-guidelines.md's "1. The disclaimer" section,
// verbatim — drafted copy, not something to paraphrase. The short version
// (Footer.tsx) is the same document's "footer" excerpt.
export default function DisclaimerPage() {
  return (
    <article className="legal-page">
      <h1>Disclaimer</h1>

      <p className="legal-lead">Dispatch Social is educational. It is not investment advice.</p>
      <p>
        Everything published on Dispatch Social is for information and discussion. It is not a
        recommendation to buy, sell, or hold any security, and it should not be treated as the
        basis for any financial decision.
      </p>

      <p className="legal-lead">We are not advisers, brokers, or professionals.</p>
      <p>
        Dispatch Social is not a registered investment adviser, a broker-dealer, or a financial
        institution of any kind. It does not manage money, execute trades, hold customer assets,
        or connect to brokerage accounts. It has no relationship with any company discussed on
        it.
      </p>

      <p className="legal-lead">The people posting are students.</p>
      <p>
        Content on Dispatch Social is written by verified college students and alumni. They are not
        professionals, they are frequently wrong, and being wrong in public is part of what the
        site is for. Nothing anyone writes here has been reviewed, verified, or endorsed by
        Dispatch Social.
      </p>

      <p className="legal-lead">Market data may be wrong, delayed, or missing.</p>
      <p>
        Prices and financial figures come from third-party providers, are not guaranteed to be
        accurate or current, and are shown as of the moment a post was written rather than as of
        right now. Do not rely on them for anything that matters.
      </p>

      <p className="legal-lead">Authors may hold positions in what they discuss.</p>
      <p>
        Anyone posting about a specific security is asked to state whether they hold a position
        in it. That statement is self-reported and not verified. Assume that any author may own,
        or may be about to buy or sell, anything they write about.
      </p>

      <p className="legal-lead">Do your own work.</p>
      <p>
        Investing involves risk, including the loss of principal. Past performance says nothing
        about future results. Before making any financial decision, do your own research and
        consider speaking with a licensed financial professional who knows your situation.
      </p>
    </article>
  );
}
