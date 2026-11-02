import type { Metadata } from "next";
import "./globals.css";
import "./research-file.css";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthModalProvider } from "@/components/auth/AuthModalContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { Masthead } from "@/components/layout/Masthead";
import { TopNav } from "@/components/layout/TopNav";
import { Footer } from "@/components/layout/Footer";

const SITE_NAME = "The Dispatch";
// The title a page without its own gets (About, Give, the 404), and
// the one shared links show. Was "Equity Research", from the retired memo.
const SITE_TITLE = `${SITE_NAME} — Free research on every U.S. public company`;
const SITE_DESCRIPTION =
  "A free research file on every U.S. public company, read from its SEC filings: ten years of financials, what stands out, and its price history. No ratings, no verdicts.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.dispatchresearch.com"),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

// Sets data-theme before first paint so there's no light/dark flash —
// mirrors the original file's localStorage-backed theme toggle.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('dispatch_theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider initialUser={user}>
          <AuthModalProvider>
            <Masthead />
            <TopNav />
            <main>{children}</main>
            <Footer />
            <AuthModal />
          </AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
