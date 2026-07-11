// Hosted-demo rate limiter. The hosted instance runs on the author's API key,
// so it's capped per visitor; local runs (your own key) are never limited —
// the limiter only engages in production. In-memory is fine: single instance.

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 15);

const hits = new Map<string, number[]>();

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterMin?: number;
}

export function checkRateLimit(key: string): RateResult {
  if (process.env.NODE_ENV !== "production" || LIMIT <= 0) {
    return { allowed: true, remaining: Infinity };
  }
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    const retryAfterMin = Math.ceil((WINDOW_MS - (now - recent[0])) / 60000);
    return { allowed: false, remaining: 0, retryAfterMin };
  }
  recent.push(now);
  hits.set(key, recent);
  // Occasional sweep so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return { allowed: true, remaining: LIMIT - recent.length };
}

export const RATE_LIMIT_MESSAGE =
  "The hosted demo runs on the author's API key, so it's capped at " +
  `${LIMIT} questions per hour per visitor. Want unlimited? Clone the repo and run it ` +
  "locally with your own key — setup takes under 2 minutes (see the README). " +
  "Or come back in a bit.";
