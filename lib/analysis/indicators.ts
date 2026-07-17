// Ported 1:1 from the-dispatch.html's client-side indicator math — same
// formulas, same thresholds. No DOM here; pure functions over number arrays.

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function rsi(values: number[], n = 14): number | null {
  if (values.length < n + 1) return null;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / n,
    avgL = losses / n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (n - 1) + (d > 0 ? d : 0)) / n;
    avgL = (avgL * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

export function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

export function macd(values: number[]): { macd: number; signal: number; hist: number } | null {
  if (values.length < 35) return null;
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = ema(line.slice(25), 9);
  return {
    macd: line[line.length - 1],
    signal: sig[sig.length - 1],
    hist: line[line.length - 1] - sig[sig.length - 1],
  };
}

export function annualizedVol(values: number[]): number | null {
  if (values.length < 30) return null;
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) rets.push(Math.log(values[i] / values[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function maxDrawdown(values: number[]): number {
  let peak = values[0],
    maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD * 100;
}

export function pctChange(values: number[], days: number): number | null {
  if (values.length <= days) return null;
  const now = values[values.length - 1];
  const then = values[values.length - 1 - days];
  return ((now - then) / then) * 100;
}

export function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtBig(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

export function sign(n: number): string {
  return n > 0 ? "+" : "";
}
