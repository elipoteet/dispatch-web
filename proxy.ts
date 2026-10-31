import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Named `proxy` (not `middleware`) — Next.js 16 renamed the convention.
export async function proxy(request: NextRequest) {
  // Research file addresses are lowercase. Redirected here rather than in the
  // [ticker] layout because only this level sees the whole path: a layout
  // knows the ticker but not which tab was asked for, so /research/NVDA/financials
  // would have landed on the Overview.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/research/") && pathname !== pathname.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
