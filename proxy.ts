import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Named `proxy` (not `middleware`) — Next.js 16 renamed the convention.
//
// It runs only on the paths in `matcher` below, because every run is billed
// as Active CPU (the Hobby plan's 4 hours a month; the account was paused for
// going over on 17 November 2026). Until then it ran on every page to refresh
// the Supabase session for the root layout, which no longer reads the
// session on the server (components/auth/AuthProvider.tsx reads it in the
// browser), so pages can be cached.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Research file addresses are lowercase. Redirected here rather than in the
  // [ticker] layout because only this level sees the whole path: a layout
  // knows the ticker but not which tab was asked for, so /research/NVDA/financials
  // would have landed on the Overview.
  if (pathname.startsWith("/research/") && pathname !== pathname.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }

  // The screener's cached pages answer a bare address. A link with anything
  // after "?" (filters, a sort, more rows, "edit") is rendered per request by
  // app/screener-view, behind the same address.
  if (search && (pathname === "/screener" || /^\/screener\/[a-z0-9-]+$/.test(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/screener" ? "/screener-view" : `/screener-view/${pathname.slice("/screener/".length)}`;
    return NextResponse.rewrite(url);
  }

  // The two API routes that act for a signed-in member keep the session
  // refreshed on the way in.
  if (pathname.startsWith("/api/watchlist") || pathname.startsWith("/api/alerts")) {
    return await updateSession(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/research/:path*", "/screener", "/screener/:path*", "/api/watchlist/:path*", "/api/alerts/:path*"],
};
