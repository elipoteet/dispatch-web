// Slide content for the 4 LinkedIn carousel decks. Pure data — rendering
// lives in render.mjs, screenshotting/PDF assembly in build.mjs.

const trendChartSvg = `
<svg viewBox="0 0 900 260" preserveAspectRatio="none">
  <polyline points="0,220 120,205 240,190 360,180 480,150 600,110 720,80 840,40 900,20"
    fill="none" stroke="#0d1b2a" stroke-width="4" />
  <polyline points="0,235 120,225 240,210 360,195 480,175 600,150 720,120 840,95 900,80"
    fill="none" stroke="#a67c00" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round" />
  <polyline points="0,245 120,240 240,232 360,222 480,208 600,192 720,175 840,158 900,148"
    fill="none" stroke="#2a3a52" stroke-width="4" stroke-dasharray="14 10" />
  <circle cx="900" cy="20" r="7" fill="#0d1b2a" />
  <circle cx="900" cy="80" r="7" fill="#a67c00" />
  <circle cx="900" cy="148" r="7" fill="#2a3a52" />
</svg>`;

const timelineSvg = `
<svg viewBox="0 0 900 140" preserveAspectRatio="none">
  <line x1="40" y1="70" x2="860" y2="70" stroke="#d9d2c0" stroke-width="3" />
  <line x1="40" y1="70" x2="310" y2="70" stroke="#0d1b2a" stroke-width="4" />
  <line x1="310" y1="70" x2="860" y2="70" stroke="#0d1b2a" stroke-width="4" stroke-dasharray="3 12" stroke-linecap="round" opacity="0.45" />
  <circle cx="310" cy="70" r="11" fill="#a67c00" />
  <circle cx="860" cy="70" r="11" fill="#0d1b2a" />
  <text x="310" y="40" text-anchor="middle" font-family="IBM Plex Mono" font-size="20" fill="#a67c00" font-weight="600">PAST DATE</text>
  <text x="860" y="40" text-anchor="end" font-family="IBM Plex Mono" font-size="20" fill="#0d1b2a" font-weight="600">TODAY</text>
  <text x="175" y="112" text-anchor="middle" font-family="IBM Plex Mono" font-size="17" fill="#2a3a52">KNOWN AS OF THAT DATE</text>
  <text x="585" y="112" text-anchor="middle" font-family="IBM Plex Mono" font-size="17" fill="#2a3a52" opacity="0.6">HADN'T HAPPENED YET</text>
</svg>`;

export const decks = [
  {
    slug: "01-ma-crossover-explained",
    label: "Technicals",
    caption: `A moving average crossover sounds like a secret signal. It's really just arithmetic.

A moving average is the average closing price over the last N days, recalculated every day. A 50-day average tracks the recent trend; a 200-day average tracks the long one. When price sits above both, and the 50-day sits above the 200-day, that's a textbook uptrend — the stock has been climbing on more than one timeframe at once.

Here's the part that gets skipped: all three lines are lagging. They describe where price has already been, not where it's going.

In The Dispatch's scoring engine, that alignment is the single biggest input to a stock's technicals score — bigger than RSI, bigger than short-term momentum. But it's still one input among several, folded into a 1–10 score, not fired off as a standalone buy signal.

Full memos, free, at dispatchresearch.com

#investing #technicalanalysis`,
    slides: [
      {
        kind: "title",
        kicker: "Technicals, demystified",
        display: "A crossover isn't a signal. It's an average.",
        sub: "What the 50-day and 200-day lines actually measure — and what they don't.",
      },
      {
        kind: "plain",
        kicker: "The basics",
        headline: "A moving average is just an average.",
        support:
          "The mean closing price over the last N days, recalculated fresh every day. It smooths out the daily noise so the underlying trend is easier to see.",
      },
      {
        kind: "trend",
        kicker: "Two speeds",
        headline: "50-day vs. 200-day",
        support: "One tracks the recent trend. The other tracks the long one — same price data, two different windows.",
        svg: trendChartSvg,
        legend: [
          { color: "#0d1b2a", label: "PRICE" },
          { color: "#a67c00", label: "50-DAY" },
          { color: "#2a3a52", label: "200-DAY" },
        ],
      },
      {
        kind: "plain",
        kicker: "The crossover",
        headline: "Price > 50-day > 200-day.",
        support:
          "That alignment is what the scoring engine calls a <strong>textbook uptrend</strong> — its single biggest input to a stock's technicals score.",
      },
      {
        kind: "plain",
        kicker: "The catch",
        headline: "It's a lagging indicator.",
        support: "All three lines describe where price has already been. None of them know what happens tomorrow.",
      },
      {
        kind: "closing",
        takeaway: "One input among several — never a trade signal on its own.",
      },
    ],
  },
  {
    slug: "02-fundamentals-vs-technicals",
    label: "Scoring",
    caption: `I've seen a stock with the best fundamentals I'd looked at all month sitting next to one of the worst charts.

Fundamentals describe the business: is revenue growing, are margins holding, is the balance sheet clean. Technicals describe the stock: is the price trending up, is it overbought, has momentum turned. They're measuring different things, so there's no rule that says they have to agree.

A great business can have a weak chart because it fell out of favor for reasons that have nothing to do with its numbers. A weak business can have a strong chart for the same reason, in reverse.

That disagreement is the useful part. Average it away into one score and you lose it — which is why The Dispatch scores fundamentals, technicals, and sentiment separately instead of blending them into a single number.

dispatchresearch.com

#investing #equityresearch`,
    slides: [
      {
        kind: "title",
        kicker: "Reading the scorecard",
        display: "Why the fundamentals and the chart don't always agree.",
        sub: "Two different questions, two different scores — on purpose.",
      },
      {
        kind: "plain",
        kicker: "Fundamentals",
        headline: "Fundamentals describe the business.",
        support: "Revenue growth. Profit margins. Debt load. Is the company itself getting healthier, or weaker.",
      },
      {
        kind: "plain",
        kicker: "Technicals",
        headline: "Technicals describe the stock.",
        support: "Price trend. Momentum. Overbought or oversold. Is the market currently rewarding the shares, or punishing them.",
      },
      {
        kind: "split",
        kicker: "Same ticker, different answers",
        headline: "They can disagree — and that's useful.",
        left: {
          title: "Fundamentals",
          score: "8",
          items: ["healthy revenue growth", "solid margins"],
        },
        right: {
          title: "Technicals",
          score: "3",
          items: ["textbook downtrend", "poor 90-day momentum"],
        },
      },
      {
        kind: "plain",
        kicker: "Why it matters",
        headline: "Averaging them would hide it.",
        support:
          "Blend two disagreeing scores into one number and the disagreement disappears with it — along with the information it was carrying.",
      },
      {
        kind: "closing",
        takeaway: "The Dispatch scores each dimension separately, so the disagreement stays visible.",
      },
    ],
  },
  {
    slug: "03-time-machine-hindsight-bias",
    label: "Time Machine",
    caption: `Ask anyone if they'd have bought a stock before it took off. Almost everyone says yes. Almost no one actually would have.

That's hindsight bias — once you know how the story ends, the earlier decision looks obvious. It wasn't, at the time.

I built a feature called the Time Machine to test myself against that. Pick any past date, and it rebuilds the research memo using only what existed then. Company financials from that exact moment aren't something I can reliably reconstruct, so instead of faking stale numbers, the memo hides them entirely for old dates. Analyst ratings roll back to the closest snapshot before that date, not the most recent one available now.

The point isn't to relive a good call. It's to notice how much confidence quietly comes from information you didn't actually have yet.

dispatchresearch.com

#investing #behavioralfinance`,
    slides: [
      {
        kind: "title",
        kicker: "The Time Machine",
        display: "Would you have bought it then? Almost no one actually would have.",
        sub: "What rebuilding a past memo teaches about hindsight bias.",
      },
      {
        kind: "plain",
        kicker: "The bias",
        headline: "Hindsight bias.",
        support: "Once you know how the story ends, the earlier decision looks obvious. It wasn't, at the time.",
      },
      {
        kind: "timeline",
        kicker: "How it works",
        headline: "Pick a past date.",
        support:
          "The memo rebuilds using only the price history and news that existed as of that day — nothing that happened after.",
        svg: timelineSvg,
      },
      {
        kind: "plain",
        kicker: "What gets hidden",
        headline: "Old financials aren't shown.",
        support:
          "Point-in-time company metrics aren't something we can reliably reconstruct, so they're hidden entirely — not faked with stale numbers.",
      },
      {
        kind: "plain",
        kicker: "Ratings, rolled back",
        headline: "Analyst ratings roll back too.",
        support: "To the closest snapshot before that date — not the most recent one available today.",
      },
      {
        kind: "closing",
        takeaway: "It's harder to fool yourself when the tool won't let you.",
      },
    ],
  },
  {
    slug: "04-rating-is-not-a-prediction",
    label: "Reading ratings",
    caption: `A Buy rating is not a promise. It's a summary.

Every rating — mine, a bank's, anyone's — is a snapshot of weighted signals collapsed into one label at one moment: revenue growing, margins compressing, leverage elevated, chart in an uptrend. The label is what's easy to skim. The reasoning underneath it is where the actual information lives.

Same with a "cheap" stock. A low multiple can mean undervalued. It can also mean the market has already priced in a problem you haven't found yet. The number alone can't tell you which.

None of this is a reason to distrust ratings. It's a reason to read past them. This isn't financial advice, just a habit worth building: read the reasoning, not just the rating.

#investing #financeeducation`,
    slides: [
      {
        kind: "title",
        kicker: "A myth, corrected",
        display: "A rating is not a prediction.",
        sub: "It's a summary — and the summary isn't the interesting part.",
      },
      {
        kind: "badge",
        kicker: "The myth",
        headline: "“A Buy rating means guaranteed upside.”",
        support: "That's not what a rating is — on The Dispatch, or anywhere else.",
        badge: "BUY",
      },
      {
        kind: "signals",
        kicker: "What a rating actually is",
        headline: "A snapshot, not a promise.",
        support: "Weighted signals, collapsed into one label at one moment in time:",
        signals: [
          { sign: "plus", text: "revenue growing" },
          { sign: "minus", text: "margins compressing" },
          { sign: "minus", text: "leverage elevated" },
          { sign: "plus", text: "chart in an uptrend" },
        ],
      },
      {
        kind: "plain",
        kicker: "Same logic, a different myth",
        headline: "“A low P/E means it's cheap.”",
        support:
          "A low multiple can mean undervalued. It can also mean the market already knows about a problem you haven't found yet.",
      },
      {
        kind: "plain",
        kicker: "What actually matters",
        headline: "The reasoning is the substance.",
        support: "The label is just the summary. The reasoning underneath it is where the real information lives.",
      },
      {
        kind: "closing",
        takeaway: "Read the reasoning, not just the rating.",
      },
    ],
  },
];
