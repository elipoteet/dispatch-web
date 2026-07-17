"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type Account = { cash: number; startingCash: number; createdAt: string };
export type PositionView = {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  isStale: boolean;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
};
export type Transaction = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  executedAt: string;
};
export type Summary = {
  cash: number;
  positionsValue: number;
  totalValue: number;
  costBasis: number;
  unrealizedPL: number;
  startingCash: number;
  totalReturnPct: number;
};
export type CurvePoint = { date: string; value: number; spyPrice: number | null };

type TradeModalState = { open: boolean; sym: string; price: number; side: "buy" | "sell" };

type PortfolioContextValue = {
  loaded: boolean;
  account: Account | null;
  positions: PositionView[];
  transactions: Transaction[];
  summary: Summary | null;
  curve: CurvePoint[];
  onboardingOpen: boolean;
  tradeModal: TradeModalState;
  toast: string | null;
  openTrade: (sym: string, price: number) => void;
  closeTrade: () => void;
  setTradeSide: (side: "buy" | "sell") => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  createAccount: (startingCash: number) => Promise<string | null>;
  resetAccount: () => Promise<void>;
  executeTrade: (shares: number) => Promise<string | null>;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<PositionView[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [curve, setCurve] = useState<CurvePoint[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [tradeModal, setTradeModal] = useState<TradeModalState>({
    open: false,
    sym: "",
    price: 0,
    side: "buy",
  });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTrade = useRef<{ sym: string; price: number } | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  const refresh = useCallback(async () => {
    const [accountRes, curveRes] = await Promise.all([
      fetch("/api/portfolio/account"),
      fetch("/api/portfolio/equity-curve"),
    ]);
    if (accountRes.ok) {
      const json = await accountRes.json();
      setAccount(json.account);
      setPositions(json.positions ?? []);
      setTransactions(json.transactions ?? []);
      setSummary(json.summary);
    }
    if (curveRes.ok) {
      const json = await curveRes.json();
      setCurve(json.curve ?? []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setAccount(null);
      setPositions([]);
      setTransactions([]);
      setSummary(null);
      setCurve([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    refresh();
  }, [user, refresh]);

  function openTrade(sym: string, price: number) {
    if (!account) {
      pendingTrade.current = { sym, price };
      setOnboardingOpen(true);
      return;
    }
    setTradeModal({ open: true, sym: sym.toUpperCase(), price, side: "buy" });
  }

  function closeTrade() {
    setTradeModal((s) => ({ ...s, open: false }));
  }

  function setTradeSide(side: "buy" | "sell") {
    setTradeModal((s) => ({ ...s, side }));
  }

  function openOnboarding() {
    pendingTrade.current = null;
    setOnboardingOpen(true);
  }

  function closeOnboarding() {
    setOnboardingOpen(false);
    pendingTrade.current = null;
  }

  async function createAccount(startingCash: number): Promise<string | null> {
    const res = await fetch("/api/portfolio/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startingCash }),
    });
    const json = await res.json();
    if (!res.ok) return json.error || "Could not open account.";

    setAccount(json.account);
    setPositions(json.positions ?? []);
    setTransactions(json.transactions ?? []);
    setSummary(json.summary);
    setOnboardingOpen(false);
    showToast(`Paper account opened with <strong>$${startingCash.toLocaleString("en-US")}</strong>`);

    const pending = pendingTrade.current;
    pendingTrade.current = null;
    if (pending) setTradeModal({ open: true, sym: pending.sym, price: pending.price, side: "buy" });

    refresh();
    return null;
  }

  async function resetAccount(): Promise<void> {
    await fetch("/api/portfolio/account", { method: "DELETE" });
    setAccount(null);
    setPositions([]);
    setTransactions([]);
    setSummary(null);
    setCurve([]);
    setOnboardingOpen(true);
  }

  async function executeTrade(shares: number): Promise<string | null> {
    const res = await fetch("/api/portfolio/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: tradeModal.sym, side: tradeModal.side, shares }),
    });
    const json = await res.json();
    if (!res.ok) return json.error || "Trade failed.";

    setAccount(json.account);
    setPositions(json.positions ?? []);
    setTransactions(json.transactions ?? []);
    setSummary(json.summary);
    closeTrade();
    showToast(json.message);
    refresh();
    return null;
  }

  return (
    <PortfolioContext.Provider
      value={{
        loaded,
        account,
        positions,
        transactions,
        summary,
        curve,
        onboardingOpen,
        tradeModal,
        toast,
        openTrade,
        closeTrade,
        setTradeSide,
        openOnboarding,
        closeOnboarding,
        createAccount,
        resetAccount,
        executeTrade,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
