// The Dispatch mark — navy D with a gold candlestick-style uptrend arrow,
// halo'd against the nav background. Approved shape: rounded bowl, rounded
// arrow joints — a deliberate exception to the site's otherwise zero-radius
// rule, the same way the mark is allowed to be the one "designed" element.
// Colors are CSS vars so it flips correctly in dark mode automatically.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 100) / 110}
      viewBox="0 0 110 100"
      aria-hidden="true"
      className="logo-mark"
    >
      <path
        fillRule="evenodd"
        fill="var(--navy)"
        d="M38,20 L80,20 C102,20 102,80 80,80 L24,80 Z
           M52,35 L72,35 C88,35 88,65 72,65 L46,65 Z"
      />
      <polyline
        points="18,80 38,62 50,72 64,54 92,26"
        fill="none"
        stroke="var(--cream)"
        strokeWidth="11"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points="18,80 38,62 50,72 64,54 92,26"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polygon points="106,16 84,22 96,36" fill="var(--gold)" />
    </svg>
  );
}
