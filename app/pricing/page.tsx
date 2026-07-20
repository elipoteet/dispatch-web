import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
  openGraph: { url: "/pricing" },
};

export default function PricingPage() {
  return (
    <section className="page active" id="page-pricing">
      <div className="pricing-head">
        <div className="label">Subscription Terms</div>
        <h1>Simple pricing.</h1>
        <p>Free to research. Paid tiers for those who want the archive and deeper data.</p>
      </div>
      <div className="plans">
        <div className="plan">
          <div className="plan-name">— Reader —</div>
          <div className="plan-price">
            $0<span className="per"> / forever</span>
          </div>
          <div className="plan-desc">For the curious. Enough to understand how we work.</div>
          <ul>
            <li>Unlimited research memos</li>
            <li>Full scorecard &amp; technicals</li>
            <li>5-year price history</li>
            <li>Live analyst consensus</li>
            <li>Recent news feed</li>
          </ul>
          <button type="button">Begin</button>
        </div>
        <div className="plan featured">
          <div className="plan-name">— Subscriber —</div>
          <div className="plan-price">
            $19<span className="per"> / month</span>
          </div>
          <div className="plan-desc">The research desk, in full.</div>
          <ul>
            <li>Everything in Reader</li>
            <li>Extended fundamentals &amp; ratios</li>
            <li>20-year price history</li>
            <li>Weekly written letter</li>
            <li>Portfolio watchlists</li>
            <li>Earnings calendar alerts</li>
          </ul>
          <button type="button">Subscribe</button>
        </div>
        <div className="plan">
          <div className="plan-name">— Firm —</div>
          <div className="plan-price">
            $129<span className="per"> / month</span>
          </div>
          <div className="plan-desc">For RIAs, research teams, and serious private investors.</div>
          <ul>
            <li>Everything in Subscriber</li>
            <li>Unlimited watchlists &amp; users</li>
            <li>CSV &amp; PDF memo exports</li>
            <li>API access</li>
            <li>Priority support</li>
          </ul>
          <button type="button">Contact Us</button>
        </div>
      </div>
    </section>
  );
}
