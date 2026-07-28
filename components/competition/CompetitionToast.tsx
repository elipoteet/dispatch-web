"use client";

import { useCompetition } from "./CompetitionProvider";

export function CompetitionToast() {
  const { toast } = useCompetition();
  return (
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
      {toast && <span dangerouslySetInnerHTML={{ __html: toast }} />}
    </div>
  );
}
