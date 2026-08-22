// Turns one slide data object (see decks.mjs) into a full standalone HTML
// document sized 1080x1350, styled with ../_shared/slide.css.

function masthead(label, page, total, dark) {
  return `
  <div class="masthead">
    <div class="brand">The Dispatch<span class="dot">·</span>${label}</div>
    <div class="page">${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
  </div>`;
}

function renderBody(slide) {
  switch (slide.kind) {
    case "title":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <h1 class="display">${slide.display}</h1>
        <div class="gold-rule"></div>
        <p class="display-sub">${slide.sub}</p>
      </div>`;

    case "plain":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <h2 class="headline">${slide.headline}</h2>
        <p class="support">${slide.support}</p>
      </div>`;

    case "trend":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <h2 class="headline">${slide.headline}</h2>
        <p class="support">${slide.support}</p>
        <div class="diagram">
          <div class="trend-chart">${slide.svg}</div>
          <div class="trend-legend">
            ${slide.legend
              .map(
                (l) =>
                  `<div class="item"><span class="swatch" style="background:${l.color}"></span>${l.label}</div>`,
              )
              .join("")}
          </div>
        </div>
      </div>`;

    case "timeline":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <h2 class="headline">${slide.headline}</h2>
        <p class="support">${slide.support}</p>
        <div class="diagram">
          <div class="timeline">${slide.svg}</div>
        </div>
      </div>`;

    case "split":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <h2 class="headline">${slide.headline}</h2>
        <div class="split">
          <div class="split-col">
            <div class="col-title">${slide.left.title}</div>
            <div class="col-score">${slide.left.score}<span style="font-size:28px;color:var(--navy-soft)">/10</span></div>
            <ul>${slide.left.items.map((i) => `<li>${i}</li>`).join("")}</ul>
          </div>
          <div class="vs-divider">VS</div>
          <div class="split-col">
            <div class="col-title">${slide.right.title}</div>
            <div class="col-score">${slide.right.score}<span style="font-size:28px;color:var(--navy-soft)">/10</span></div>
            <ul>${slide.right.items.map((i) => `<li>${i}</li>`).join("")}</ul>
          </div>
        </div>
      </div>`;

    case "badge":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <div class="badge">${slide.badge}</div>
        <h2 class="headline">${slide.headline}</h2>
        <p class="support">${slide.support}</p>
      </div>`;

    case "signals":
      return `
      <div class="body-copy">
        <div class="kicker">${slide.kicker}</div>
        <h2 class="headline">${slide.headline}</h2>
        <p class="support">${slide.support}</p>
        <div class="diagram">
          <div class="signal-lines">
            ${slide.signals
              .map(
                (s) =>
                  `<div><span class="${s.sign}">${s.sign === "plus" ? "+" : "−"}</span> ${s.text}</div>`,
              )
              .join("")}
          </div>
        </div>
      </div>`;

    case "closing":
      return `
      <div class="closing">
        <p class="takeaway">${slide.takeaway}</p>
        <div class="site-tag">Full memos, free, at dispatchresearch.com</div>
      </div>`;

    default:
      throw new Error(`Unknown slide kind: ${slide.kind}`);
  }
}

export function renderSlide({ deckLabel, slide, page, total }) {
  const dark = slide.kind === "title" || slide.kind === "closing";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="../_shared/slide.css" />
</head>
<body>
  <div class="slide${dark ? " dark" : ""}">
    ${masthead(deckLabel, page, total, dark)}
    ${renderBody(slide)}
  </div>
</body>
</html>`;
}
