import type { Metadata } from "next";
import { BeginButton } from "@/components/pricing/BeginButton";
import { SubscribeButton } from "@/components/pricing/SubscribeButton";

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
  openGraph: { url: "/pricing" },
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;

  return (
    <section className="page active" id="page-pricing">
      <div className="pricing-head">
        <div className="label">Subscription Terms</div>
        <h1>Simple pricing.</h1>
        <p>Free to research. Paid tiers for those who want the archive and deeper data.</p>
      </div>

      {checkout === "success" && (
        <div className="checkout-banner success">
          <strong>You&rsquo;re in.</strong> Your 7-day trial has started — cancel anytime from Manage
          Subscription before it ends and you won&rsquo;t be charged.
        </div>
      )}
      {checkout === "cancel" && (
        <div className="checkout-banner">Checkout was canceled — no charge was made.</div>
      )}

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
          <BeginButton />
        </div>
        <div className="plan featured">
          <div className="plan-name">— Subscriber —</div>
          <div className="plan-price">
            $7<span className="per"> / month</span>
          </div>
          <div className="plan-trial">7-day free trial · cancel anytime</div>
          <div className="plan-desc">The research desk, in full.</div>
          <ul>
            <li>Everything in Reader</li>
            <li>Extended fundamentals &amp; ratios</li>
            <li>20-year price history</li>
            <li>Weekly written letter</li>
            <li>Portfolio watchlists</li>
            <li>Earnings calendar alerts</li>
          </ul>
          <SubscribeButton />
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
          <a className="plan-cta" href="mailto:eli.poteet@gmail.com?subject=The%20Dispatch%20%E2%80%94%20Firm%20plan">
            Contact Us
          </a>
        </div>
      </div>
    </section>
  );
}
