// "14m" / "2h" / "3d" for recent posts, falling back to a plain date once
// it's old enough that a relative stamp stops being useful.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

export function isWithinEditWindow(createdAtIso: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAtIso).getTime() <= EDIT_WINDOW_MS;
}
