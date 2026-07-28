import type { Metadata } from "next";
import Link from "next/link";

const CHARITY_NAME = "Gather";
const CHARITY_URL = "https://secure.givelively.org/donate/gather";

export const metadata: Metadata = {
  title: "Give Back",
  alternates: { canonical: "/give" },
  openGraph: { url: "/give" },
};

export default function GivePage() {
  return (
    <section className="page active" id="page-give">
      <div className="give-head">
        <div className="label">The Dispatch Is Free</div>
        <h1>We don&rsquo;t charge for this.</h1>
        <p>
          Every memo, every feature — no paywall, no trial that quietly starts billing you. If The
          Dispatch has been useful to you, the best way to say thanks isn&rsquo;t a subscription.
        </p>
      </div>

      <div className="give-card">
        <div className="give-card-label">Instead</div>
        <div className="give-card-name">{CHARITY_NAME}</div>
        <p className="give-card-desc">
          Consider a donation to {CHARITY_NAME} — a cause worth more than we&rsquo;d ever charge for
          research.
        </p>
        <a className="give-cta" href={CHARITY_URL} target="_blank" rel="noopener noreferrer">
          Donate to {CHARITY_NAME} →
        </a>
      </div>

      <div className="give-footer">
        Prefer to just keep researching? It&rsquo;s free either way.{" "}
        <Link href="/research">Go to the Research Desk →</Link>
      </div>
    </section>
  );
}
