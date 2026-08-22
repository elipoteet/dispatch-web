// AI daily digest — writes a short, editorial-voice paragraph summarizing
// what happened for a ticker (or the market as a whole) today, for the
// alert bell's "Daily note" entries. See dispatch-ai-digest-plan.md and
// app/api/cron/alerts/route.ts (the only caller). Never throws — a
// missing key, a non-200 response, or a malformed body all resolve to
// null, the same "best-effort, don't kill the run" contract every other
// function in lib/providers.ts already follows.

import type { DetectedAlert } from "./alertState";

export type DigestInput =
  | { kind: "ticker"; ticker: string; alerts: DetectedAlert[]; headlines: string[] }
  | { kind: "market"; headlines: string[] };

const SYSTEM_PROMPT = `You write short daily notes for The Dispatch, an equity-research site. Match its voice exactly: calm, declarative, no hype, no exclamation points, no "surge"/"exciting"/"soar" style language. State what happened and, only if it's evident from the input, why it might matter -- never speculate beyond what's given. Write exactly one paragraph, 3-4 sentences, plain English. No bullet points, no markdown, no preamble like "Here's a summary" or "Certainly." If the input is thin, keep the note short rather than padding it out.`;

function describeAlert(a: DetectedAlert): string {
  switch (a.type) {
    case "score_change":
      return `the rating moved from ${a.oldValue} to ${a.newValue}`;
    case "rsi":
      return `RSI moved into ${a.newValue}`;
    case "ma_cross":
      return `a ${a.newValue} cross formed`;
    default:
      return "something changed";
  }
}

function buildUserMessage(input: DigestInput): string {
  if (input.kind === "ticker") {
    const parts: string[] = [];
    if (input.alerts.length) {
      parts.push(`Today's changes for ${input.ticker}: ${input.alerts.map(describeAlert).join("; ")}.`);
    }
    if (input.headlines.length) {
      parts.push(`Recent headlines: ${input.headlines.join(" | ")}`);
    }
    return `Write today's note for ${input.ticker}.\n\n${parts.join("\n")}`;
  }
  return `Write today's general market note.\n\nToday's headlines: ${input.headlines.join(" | ")}`;
}

export async function writeDigest(input: DigestInput): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.content?.[0]?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
