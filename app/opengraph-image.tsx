import { ImageResponse } from "next/og";

export const alt = "The Dispatch — Equity Research, written for readers.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same mark as the nav, inverted (cream D, gold arrow) for the navy card
// background — matches the "on navy" variant from the brand guidelines.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0d1b2a",
          padding: "90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <svg width="100" height="91" viewBox="0 0 110 100">
            <path
              fillRule="evenodd"
              fill="#f5f1e8"
              d="M38,20 L80,20 C102,20 102,80 80,80 L24,80 Z
                 M52,35 L72,35 C88,35 88,65 72,65 L46,65 Z"
            />
            <polyline
              points="18,80 38,62 50,72 64,54 92,26"
              fill="none"
              stroke="#0d1b2a"
              strokeWidth="11"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points="18,80 38,62 50,72 64,54 92,26"
              fill="none"
              stroke="#d4a843"
              strokeWidth="5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polygon points="106,16 84,22 96,36" fill="#d4a843" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 58, fontWeight: 700, color: "#f5f1e8", letterSpacing: -1.5 }}>
              DISPATCH
            </div>
            <div
              style={{
                fontSize: 16,
                letterSpacing: 7,
                color: "#8a96a8",
                marginTop: 6,
                textTransform: "uppercase",
              }}
            >
              Equity Research &amp; Analytics
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 60,
            fontSize: 32,
            color: "#ebe5d6",
            maxWidth: 940,
            lineHeight: 1.4,
          }}
        >
          A full research memo on any U.S. stock in five seconds — scored, sourced, and written to
          be read.
        </div>
      </div>
    ),
    { ...size },
  );
}
