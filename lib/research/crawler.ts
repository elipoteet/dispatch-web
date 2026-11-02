// Whether a request comes from a search engine or other crawler, by its
// User-Agent. Pure.
//
// Crawlers get every page, with whatever is already stored. What they don't
// get is the background work a person's first visit sets off: loading six
// peers' SEC files, reading back two years of insider filings, comparing two
// 10-Ks. Each of those stores data for good, and peers link to peers, so a
// crawler walking the site could otherwise fill the database (raised in the 2
// November review). People see no difference.
const CRAWLER =
  /bot\b|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|pinterest|whatsapp|telegram|discord|yandex|baidu|semrush|ahrefs|bytespider|gptbot|claude|ccbot|perplexity|headless|python-requests|curl\/|wget|httpclient|okhttp|go-http-client/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return CRAWLER.test(userAgent);
}
