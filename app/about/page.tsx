import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about" },
};

export default function AboutPage() {
  return (
    <section className="page active" id="page-about">
      <div className="about">
        <div className="label">About the Firm</div>
        <h1>About The Dispatch.</h1>
        <div className="about-body">
          <p>
            The Dispatch was founded on a small, unfashionable conviction: that most investors
            would make better decisions if they did less, read more, and stared at fewer charts.
            We are not a terminal. We are a research desk.
          </p>

          <p>
            Every ticker submitted returns a structured memo — scorecard, fundamentals,
            technicals, sentiment, risks, catalysts — composed from live market data. No
            proprietary algorithms. No black-box signals. Every number is labeled with its source;
            every rating is explained by the underlying evidence. What you see is what a diligent
            analyst would produce, performed in seconds rather than hours.
          </p>

          <h2>The method.</h2>

          <p>
            We score on four dimensions: Fundamentals (growth, profitability, balance sheet),
            Technicals (trend structure, momentum, volatility), Sentiment (analyst consensus, news
            flow), and a Composite that weights them against one another. Each dimension receives a
            score from one to ten, with the signal that drove it shown explicitly beside it.
          </p>

          <p>
            We favor durable businesses over momentum trades. We treat volatility as information,
            not risk. We believe that a well-named uncertainty is more useful than a confident
            prediction. If you want someone to tell you what to buy, you should hire an advisor; if
            you want to read carefully and decide for yourself, we built this for you.
          </p>

          <h2>The Time Machine.</h2>

          <p>
            Every memo is a snapshot of a moment — but moments are worth revisiting. The Time
            Machine lets you pick any date within the last three years and see the memo as it
            would have read then: technicals and sentiment recalculated from that day&rsquo;s
            data, the rating recomputed under the same rules we use today. Fundamentals are held
            back rather than shown stale, since point-in-time filings aren&rsquo;t something we
            can honestly reconstruct after the fact.
          </p>

          <p>
            Pull up a memo from six months ago and compare it directly to the live one. Did the
            thesis hold? Did the rating change, and why? Hindsight is usually wasted on investors
            who never write anything down. We&rsquo;d rather you could check your own work.
          </p>

          <h2>What we are not.</h2>

          <p>
            The Dispatch does not offer investment advice. Our memos are descriptive summaries of
            public information — useful context for your own thinking, not substitutes for it. The
            ratings reflect rule-based scoring against historical patterns; they have no predictive
            warranty. Markets will continue to surprise everyone, including us.
          </p>

          <h2 id="contact">Who&rsquo;s behind this.</h2>

          <p>
            Everything above is written as &ldquo;we,&rdquo; because that&rsquo;s how research
            usually reads — but The Dispatch is built and run by one person. I&rsquo;m Eli
            Poteet, a finance student at the University of New Hampshire. I built this because I
            actually trade, and I was tired of juggling six tabs and a spreadsheet just to get a
            straight answer on a stock I already cared about. I wanted one page that did the
            reading for me and showed its work — so I built it, and I use it on my own watchlist
            every day.
          </p>

          <p>
            There&rsquo;s no team here, no compliance desk, no firm — just someone building the
            tool he wished existed. If you spot something wrong, have a ticker you think the
            engine gets wrong, or just want to talk shop, reach out. I read everything.
          </p>

          <p className="about-signature">
            <span className="name">— Eli Poteet</span>
            <br />
            <a href="mailto:eli.poteet@gmail.com">eli.poteet@gmail.com</a>
            {" · "}
            <a href="https://www.linkedin.com/in/eli-poteet" target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            {" · "}
            <a href="https://github.com/elipoteet" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
