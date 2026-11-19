import Link from "next/link";
import type { ComponentProps } from "react";
import { needsFullLoad } from "@/lib/screener/links";

// A link inside the screener. /screener is a cached page (app/screener/page.tsx),
// and Next's client router, having that page in hand, can show it again for
// /screener?anything instead of asking the server for the filtered view
// (proxy.ts sends those to app/screener-view). It did on the live site on 18
// November 2026, for "Show results" and for removing a filter chip. So a link
// to /screener with a query string is a plain link, a full page load; every
// other link stays a client-side move.
export function ScreenerLink({ href, children, className, replace, scroll, prefetch, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  if (needsFullLoad(href)) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} replace={replace} scroll={scroll} prefetch={prefetch ?? false} {...rest}>
      {children}
    </Link>
  );
}
