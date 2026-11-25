// The shared count of Twelve Data credits (migration 0032), through the
// service-role client. Server-only. See lib/prices/budget.ts.

import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Ledger, PriceCaller } from "@/lib/prices/budget";

export const databaseLedger: Ledger = {
  async claim(caller: PriceCaller, visitorCap: number, totalCap: number): Promise<boolean | null> {
    try {
      const { data, error } = await createServiceRoleClient().rpc("claim_price_credit", {
        p_caller: caller,
        p_visitor_cap: visitorCap,
        p_total_cap: totalCap,
      });
      if (error) {
        console.warn(`[prices] credit count unavailable (${error.code ?? "error"}): ${error.message}`);
        return null;
      }
      return data === true;
    } catch (err) {
      console.warn("[prices] credit count unavailable:", err instanceof Error ? err.message : err);
      return null;
    }
  },
  async markOut(): Promise<void> {
    const { error } = await createServiceRoleClient().rpc("mark_price_credits_out");
    if (error) console.warn(`[prices] couldn't record that Twelve Data is out for the day: ${error.message}`);
  },
};
