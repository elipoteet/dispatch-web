import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthModalProvider } from "@/components/auth/AuthModalContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { PortfolioProvider } from "@/components/portfolio/PortfolioProvider";
import { OnboardingModal } from "@/components/portfolio/OnboardingModal";
import { TradeModal } from "@/components/portfolio/TradeModal";
import { Toast } from "@/components/portfolio/Toast";
import { Masthead } from "@/components/layout/Masthead";
import { TopNav } from "@/components/layout/TopNav";
import { Footer } from "@/components/layout/Footer";

const SITE_NAME = "The Dispatch";
const SITE_DESCRIPTION =
  "A full research memo on any U.S. stock in five seconds — scored, sourced, and written to be read.";

export const metadata: Metadata = {
  metadataBase: new URL("https://dispatch-web-psi.vercel.app"),
  title: {
    default: `${SITE_NAME} — Equity Research`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} — Equity Research`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Equity Research`,
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
            <PortfolioProvider>
              <Masthead />
              <TopNav />
              <main>{children}</main>
              <Footer />
              <AuthModal />
              <OnboardingModal />
              <TradeModal />
              <Toast />
            </PortfolioProvider>
          </AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
