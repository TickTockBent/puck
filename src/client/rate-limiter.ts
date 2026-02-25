import type { RateLimitEntry } from "../types.js";
import { RateLimitError } from "../util/errors.js";

// Per-endpoint rate limit tracking, populated from response headers
const rateLimits = new Map<string, RateLimitEntry>();

export function normalizeEndpoint(method: string, path: string): string {
  // Normalize long numeric IDs in paths to :id placeholders
  // Only replace segments with 3+ digits to avoid replacing /2/ (API version)
  const normalized = path.replace(/\/\d{3,}/g, "/:id");
  return `${method.toUpperCase()} ${normalized}`;
}

export function updateFromHeaders(
  endpoint: string,
  headers: Record<string, string | undefined>,
): void {
  const limit = headers["x-rate-limit-limit"];
  const remaining = headers["x-rate-limit-remaining"];
  const reset = headers["x-rate-limit-reset"];

  if (limit === undefined || remaining === undefined || reset === undefined) {
    return;
  }

  rateLimits.set(endpoint, {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt: parseInt(reset, 10),
  });
}

export function checkRateLimit(endpoint: string): void {
  const entry = rateLimits.get(endpoint);
  if (!entry) {
    // No data yet — allow the call
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // If the window has reset, clear and allow
  if (now >= entry.resetAt) {
    rateLimits.delete(endpoint);
    return;
  }

  if (entry.remaining <= 0) {
    throw new RateLimitError(endpoint, entry.limit, entry.resetAt);
  }
}

export function decrementRemaining(endpoint: string): void {
  const entry = rateLimits.get(endpoint);
  if (entry && entry.remaining > 0) {
    entry.remaining--;
  }
}

export function getRateLimitStatus(): Record<string, RateLimitEntry & { resetAtISO: string }> {
  const result: Record<string, RateLimitEntry & { resetAtISO: string }> = {};
  const now = Math.floor(Date.now() / 1000);

  for (const [endpoint, entry] of rateLimits) {
    // Only include active windows
    if (entry.resetAt > now) {
      result[endpoint] = {
        ...entry,
        resetAtISO: new Date(entry.resetAt * 1000).toISOString(),
      };
    }
  }

  return result;
}

export function clearRateLimits(): void {
  rateLimits.clear();
}
