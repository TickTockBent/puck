import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeEndpoint,
  updateFromHeaders,
  checkRateLimit,
  decrementRemaining,
  getRateLimitStatus,
  clearRateLimits,
} from "../../../src/client/rate-limiter.js";
import { RateLimitError } from "../../../src/util/errors.js";

describe("normalizeEndpoint", () => {
  it("normalizes numeric IDs to :id", () => {
    expect(normalizeEndpoint("GET", "/2/tweets/12345")).toBe("GET /2/tweets/:id");
  });

  it("normalizes multiple IDs", () => {
    expect(normalizeEndpoint("GET", "/2/users/123/tweets")).toBe("GET /2/users/:id/tweets");
  });

  it("preserves method case", () => {
    expect(normalizeEndpoint("post", "/2/tweets")).toBe("POST /2/tweets");
  });

  it("handles paths without IDs", () => {
    expect(normalizeEndpoint("GET", "/2/tweets/search/recent")).toBe("GET /2/tweets/search/recent");
  });
});

describe("rate limit tracking", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  it("allows calls when no data exists", () => {
    expect(() => checkRateLimit("GET /2/tweets/:id")).not.toThrow();
  });

  it("tracks limits from response headers", () => {
    const futureReset = Math.floor(Date.now() / 1000) + 900;
    updateFromHeaders("GET /2/tweets/:id", {
      "x-rate-limit-limit": "450",
      "x-rate-limit-remaining": "449",
      "x-rate-limit-reset": String(futureReset),
    });

    const status = getRateLimitStatus();
    expect(status["GET /2/tweets/:id"]).toBeDefined();
    expect(status["GET /2/tweets/:id"].limit).toBe(450);
    expect(status["GET /2/tweets/:id"].remaining).toBe(449);
  });

  it("throws RateLimitError when remaining is 0", () => {
    const futureReset = Math.floor(Date.now() / 1000) + 900;
    updateFromHeaders("POST /2/tweets", {
      "x-rate-limit-limit": "100",
      "x-rate-limit-remaining": "0",
      "x-rate-limit-reset": String(futureReset),
    });

    expect(() => checkRateLimit("POST /2/tweets")).toThrow(RateLimitError);
  });

  it("allows calls when window has reset", () => {
    const pastReset = Math.floor(Date.now() / 1000) - 10;
    updateFromHeaders("POST /2/tweets", {
      "x-rate-limit-limit": "100",
      "x-rate-limit-remaining": "0",
      "x-rate-limit-reset": String(pastReset),
    });

    expect(() => checkRateLimit("POST /2/tweets")).not.toThrow();
  });

  it("decrements remaining count", () => {
    const futureReset = Math.floor(Date.now() / 1000) + 900;
    updateFromHeaders("GET /2/tweets/:id", {
      "x-rate-limit-limit": "450",
      "x-rate-limit-remaining": "10",
      "x-rate-limit-reset": String(futureReset),
    });

    decrementRemaining("GET /2/tweets/:id");

    const status = getRateLimitStatus();
    expect(status["GET /2/tweets/:id"].remaining).toBe(9);
  });

  it("ignores headers with missing fields", () => {
    updateFromHeaders("GET /2/tweets/:id", {
      "x-rate-limit-limit": "450",
    });

    const status = getRateLimitStatus();
    expect(status["GET /2/tweets/:id"]).toBeUndefined();
  });

  it("excludes expired windows from status", () => {
    const pastReset = Math.floor(Date.now() / 1000) - 100;
    updateFromHeaders("GET /2/tweets/:id", {
      "x-rate-limit-limit": "450",
      "x-rate-limit-remaining": "200",
      "x-rate-limit-reset": String(pastReset),
    });

    const status = getRateLimitStatus();
    expect(Object.keys(status)).toHaveLength(0);
  });
});
