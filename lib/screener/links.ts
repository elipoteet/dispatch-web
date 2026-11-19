// Whether a move to this screener address has to be a full page load
// (components/screener/ScreenerLink.tsx). /screener with anything after "?"
// is rendered per request behind the cached /screener, and the browser's router
// can mistake one for the other. A starting screen's own address with a sort
// or "show more" (/screener/{slug}?…) moves client-side correctly, so it keeps
// its scroll position.
export function needsFullLoad(href: string): boolean {
  return href.startsWith("/screener?");
}

// Moves the browser to a screener address: a full page load where needed,
// otherwise the router's client-side move.
export function goTo(href: string, push: (href: string) => void): void {
  if (needsFullLoad(href)) window.location.assign(href);
  else push(href);
}
