import { NextResponse } from "next/server";
import { getTickerMap } from "@/lib/sec/client";
import { searchCompanies } from "@/lib/research/search";

// Company search for the research search box. Reads the SEC's ticker list,
// which lib/sec/client.ts caches for a day, so a keystroke costs no request to
// anyone outside this server.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 60) ?? "";
  if (!q.trim()) return NextResponse.json({ results: [] });
  const map = await getTickerMap();
  if (!map) return NextResponse.json({ results: [] });
  const entries = Object.values(map).map((ref) => ({ symbol: ref.symbol, name: ref.name }));
  return NextResponse.json({ results: searchCompanies(entries, q) });
}
