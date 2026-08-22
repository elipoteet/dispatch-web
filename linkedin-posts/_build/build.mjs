// Builds all 4 LinkedIn carousel decks: writes each slide as a standalone
// HTML file, screenshots it at 1080x1350 with Playwright, combines the PNGs
// into a per-deck PDF, and writes the caption.md. Run with:
//   node linkedin-posts/_build/build.mjs
import { chromium } from "playwright";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decks } from "./decks.mjs";
import { renderSlide } from "./render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  for (const deck of decks) {
    const deckDir = path.join(root, deck.slug);
    await mkdir(deckDir, { recursive: true });

    const pngPaths = [];
    for (let i = 0; i < deck.slides.length; i++) {
      const slide = deck.slides[i];
      const pageNum = i + 1;
      const html = renderSlide({
        deckLabel: deck.label,
        slide,
        page: pageNum,
        total: deck.slides.length,
      });

      const htmlPath = path.join(deckDir, `slide-${pageNum}.html`);
      await writeFile(htmlPath, html, "utf8");

      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      const pngPath = path.join(deckDir, `slide-${pageNum}.png`);
      await page.screenshot({ path: pngPath });
      pngPaths.push(pngPath);
      console.log(`  rendered ${deck.slug}/slide-${pageNum}.png`);
    }

    // Assemble the deck's PNGs into a single PDF, one image per page at the
    // exact carousel resolution.
    const pdfPageHtml = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { margin:0; padding:0; }
  @page { size: 1080px 1350px; margin: 0; }
  .page { width:1080px; height:1350px; page-break-after: always; overflow:hidden; }
  .page:last-child { page-break-after: auto; }
  .page img { width:1080px; height:1350px; display:block; }
</style>
</head><body>
${pngPaths.map((p) => `<div class="page"><img src="${pathToFileURL(p).href}" /></div>`).join("\n")}
</body></html>`;

    const pdfHtmlPath = path.join(deckDir, "_pdf-assembly.html");
    await writeFile(pdfHtmlPath, pdfPageHtml, "utf8");
    await page.goto(pathToFileURL(pdfHtmlPath).href, { waitUntil: "networkidle" });

    const pdfPath = path.join(deckDir, "carousel.pdf");
    await page.pdf({
      path: pdfPath,
      width: "1080px",
      height: "1350px",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    console.log(`  assembled ${deck.slug}/carousel.pdf`);

    await writeFile(path.join(deckDir, "caption.md"), deck.caption + "\n", "utf8");
    console.log(`  wrote ${deck.slug}/caption.md`);
  }

  await browser.close();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
