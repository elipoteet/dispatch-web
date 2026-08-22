import { PortfolioProvider } from "@/components/portfolio/PortfolioProvider";
import { OnboardingModal } from "@/components/portfolio/OnboardingModal";
import { TradeModal } from "@/components/portfolio/TradeModal";
import { Toast } from "@/components/portfolio/Toast";
import { CompetitionProvider } from "@/components/competition/CompetitionProvider";
import { CompetitionTradeModal } from "@/components/competition/CompetitionTradeModal";
import { CompetitionToast } from "@/components/competition/CompetitionToast";
import { Masthead } from "@/components/layout/Masthead";
import { TopNav } from "@/components/layout/TopNav";
import { Footer } from "@/components/layout/Footer";

// Chrome + context for the original equity-research surface only
// (/research, /portfolio, /leaderboard, /about, /give). Moved out of the
// true root layout so the new social surface (app/(social)/) doesn't mount
// any of this — see docs/phase-one.md. AuthProvider/AuthModalProvider/
// AuthModal stay in the root layout since both surfaces need sign-in.
export default function ResearchLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PortfolioProvider>
      <CompetitionProvider>
        <Masthead />
        <TopNav />
        <main>{children}</main>
        <Footer />
        <OnboardingModal />
        <TradeModal />
        <Toast />
        <CompetitionTradeModal />
        <CompetitionToast />
      </CompetitionProvider>
    </PortfolioProvider>
  );
}
