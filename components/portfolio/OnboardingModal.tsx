"use client";

import { useState } from "react";
import { usePortfolio } from "./PortfolioProvider";

const PRESETS = [
  { amt: 10000, desc: "Beginner" },
  { amt: 100000, desc: "Realistic" },
  { amt: 500000, desc: "Serious" },
  { amt: 1000000, desc: "Showcase" },
];

export function OnboardingModal() {
  const { onboardingOpen, closeOnboarding, createAccount } = usePortfolio();
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!onboardingOpen) return null;

  async function open(amt: number) {
    setError(null);
    const err = await createAccount(amt);
    if (err) setError(err);
  }

  function openCustom() {
    const v = Number(custom);
    if (v >= 100 && v <= 100_000_000) open(v);
  }

  return (
    <div
      className="onboard-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboardTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeOnboarding();
      }}
    >
      <div className="onboard-modal">
        <div className="label">Open a Paper Account</div>
        <h2 id="onboardTitle">Pick your starting cash.</h2>
        <p>
          This is a simulated portfolio — no real money is involved. Pick how much paper cash to
          start with. You can always reset later.
        </p>
        <div className="onboard-options">
          {PRESETS.map((p) => (
            <button className="onboard-option" type="button" key={p.amt} onClick={() => open(p.amt)}>
              <span className="amt">${p.amt.toLocaleString("en-US")}</span>
              <span className="desc">{p.desc}</span>
            </button>
          ))}
        </div>
        <div className="onboard-custom">
          <input
            type="number"
            placeholder="Or pick a custom amount"
            min={100}
            max={100000000}
            step={1000}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openCustom()}
          />
          <button type="button" onClick={openCustom}>
            Open
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
