"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type CompetitionAccount = { cash: number; startingBalance: number; firstTradeAt: string | null; createdAt: string };
export type CompetitionPositionView = {
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
export type CompetitionTrade = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  executedAt: string;
};
export type CompetitionSummary = { cash: number; positionsValue: number; equity: number; returnPct: number };
export type Standing = { snapshotDate: string; rank: number | null; eligible: boolean };

type TradeModalState = { open: boolean; sym: string; price: number; side: "buy" | "sell" };

type CompetitionContextValue = {
  loaded: boolean;
  month: string | null;
  handle: string | null;
  optedIn: boolean;
  account: CompetitionAccount | null;
  positions: CompetitionPositionView[];
  trades: CompetitionTrade[];
  summary: CompetitionSummary | null;
  dailyParticipation: { investedRatio: number }[];
  standing: Standing | null;
  tradeModal: TradeModalState;
  toast: string | null;
  optIn: (handle: string) => Promise<string | null>;
  openTrade: (sym: string, price: number) => void;
  closeTrade: () => void;
  setTradeSide: (side: "buy" | "sell") => void;
  executeTrade: (shares: number) => Promise<string | null>;
};

const CompetitionContext = createContext<CompetitionContextValue | null>(null);

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [account, setAccount] = useState<CompetitionAccount | null>(null);
  const [positions, setPositions] = useState<CompetitionPositionView[]>([]);
  const [trades, setTrades] = useState<CompetitionTrade[]>([]);
  const [summary, setSummary] = useState<CompetitionSummary | null>(null);
  const [dailyParticipation, setDailyParticipation] = useState<{ investedRatio: number }[]>([]);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [tradeModal, setTradeModal] = useState<TradeModalState>({ open: false, sym: "", price: 0, side: "buy" });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  const refresh = useCallback(async () => {
    const [profileRes, accountRes] = await Promise.all([
      fetch("/api/competition/profile"),
      fetch("/api/competition/account"),
    ]);
    if (profileRes.ok) {
      const json = await profileRes.json();
      setHandle(json.handle ?? null);
      setOptedIn(Boolean(json.optedIn));
    }
    if (accountRes.ok) {
      const json = await accountRes.json();
      setMonth(json.month ?? null);
      setAccount(json.account ?? null);
      setPositions(json.positions ?? []);
      setTrades(json.trades ?? []);
      setSummary(json.summary ?? null);
      setDailyParticipation(json.dailyParticipation ?? []);
      setStanding(json.standing ?? null);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setHandle(null);
      setOptedIn(false);
      setAccount(null);
      setPositions([]);
      setTrades([]);
      setSummary(null);
      setDailyParticipation([]);
      setStanding(null);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    refresh();
  }, [user, refresh]);

  async function optIn(newHandle: string): Promise<string | null> {
    const res = await fetch("/api/competition/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: newHandle }),
    });
    const json = await res.json();
    if (!res.ok) return json.error || "Could not opt in.";
    setHandle(json.handle);
    setOptedIn(true);
    showToast(`You're in — trading as <strong>@${json.handle}</strong>`);
    return null;
  }

  function openTrade(sym: string, price: number) {
    setTradeModal({ open: true, sym: sym.toUpperCase(), price, side: "buy" });
  }

  function closeTrade() {
    setTradeModal((s) => ({ ...s, open: false }));
  }

  function setTradeSide(side: "buy" | "sell") {
    setTradeModal((s) => ({ ...s, side }));
  }

  async function executeTrade(shares: number): Promise<string | null> {
    const res = await fetch("/api/competition/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: tradeModal.sym, side: tradeModal.side, shares }),
    });
    const json = await res.json();
    if (!res.ok) return json.error || "Trade failed.";

    setAccount(json.account ?? null);
    setPositions(json.positions ?? []);
    setTrades(json.trades ?? []);
    setSummary(json.summary ?? null);
    closeTrade();
    showToast(json.message);
    refresh();
    return null;
  }

  return (
    <CompetitionContext.Provider
      value={{
        loaded,
        month,
        handle,
        optedIn,
        account,
        positions,
        trades,
        summary,
        dailyParticipation,
        standing,
        tradeModal,
        toast,
        optIn,
        openTrade,
        closeTrade,
        setTradeSide,
        executeTrade,
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  const ctx = useContext(CompetitionContext);
  if (!ctx) throw new Error("useCompetition must be used within CompetitionProvider");
  return ctx;
}
