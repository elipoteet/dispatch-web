"use client";

import { useSyncExternalStore } from "react";
import { getRecentSnapshot, getServerRecentSnapshot, subscribeRecent, type RecentEntry } from "@/lib/recent";

// The visitor's recently viewed companies, newest first. Empty on the server
// and during hydration, then filled from this browser's storage, so a page
// that shows it stays cacheable and never mismatches. Other tabs stay in step
// through the browser's "storage" event.
export function useRecent(): RecentEntry[] {
  return useSyncExternalStore(subscribeRecent, getRecentSnapshot, getServerRecentSnapshot);
}
