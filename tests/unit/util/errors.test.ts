import { describe, it, expect } from "vitest";
import {
  PuckApiError,
  RateLimitError,
  AuthRequiredError,
  ContentTooLongError,
  MediaUploadError,
  ThreadPartialError,
  toPuckError,
} from "../../../src/util/errors.js";

describe("PuckApiError", () => {
  it("creates error with code and message", () => {
    const err = new PuckApiError("api_error", "Something went wrong");
    expect(err.code).toBe("api_error");
    expect(err.message).toBe("Something went wrong");
    expect(err.name).toBe("PuckApiError");
  });

  it("converts to PuckError shape", () => {
    const err = new PuckApiError("not_found", "Post not found", {
      endpoint: "GET /2/tweets/:id",
      details: { id: "123" },
    });
    const puckError = err.toPuckError();
    expect(puckError.error).toBe("not_found");
    expect(puckError.message).toBe("Post not found");
    expect(puckError.endpoint).toBe("GET /2/tweets/:id");
    expect(puckError.details).toEqual({ id: "123" });
  });

  it("omits undefined optional fields", () => {
    const err = new PuckApiError("api_error", "test");
    const puckError = err.toPuckError();
    expect(puckError).not.toHaveProperty("retryAfter");
    expect(puckError).not.toHaveProperty("endpoint");
    expect(puckError).not.toHaveProperty("details");
  });
});

describe("RateLimitError", () => {
  it("includes endpoint and retry info", () => {
    const futureReset = Math.floor(Date.now() / 1000) + 300;
    const err = new RateLimitError("POST /2/tweets", 100, futureReset);
    expect(err.code).toBe("rate_limited");
    expect(err.name).toBe("RateLimitError");
    expect(err.endpoint).toBe("POST /2/tweets");
    expect(err.retryAfter).toBeGreaterThan(0);
    expect(err.retryAfter).toBeLessThanOrEqual(300);
  });
});

describe("AuthRequiredError", () => {
  it("uses default message", () => {
    const err = new AuthRequiredError();
    expect(err.code).toBe("auth_required");
    expect(err.message).toContain("puck_auth_status");
  });

  it("accepts custom message", () => {
    const err = new AuthRequiredError("Custom message");
    expect(err.message).toBe("Custom message");
  });
});

describe("ContentTooLongError", () => {
  it("includes length details", () => {
    const err = new ContentTooLongError(300, 280);
    expect(err.code).toBe("content_too_long");
    expect(err.message).toContain("300");
    expect(err.message).toContain("280");
  });
});

describe("MediaUploadError", () => {
  it("includes details", () => {
    const err = new MediaUploadError("Upload failed", { stage: "finalize" });
    expect(err.code).toBe("media_failed");
    expect(err.details).toEqual({ stage: "finalize" });
  });
});

describe("ThreadPartialError", () => {
  it("includes failure index and posted IDs", () => {
    const err = new ThreadPartialError(2, ["id1", "id2"], new Error("Rate limited"));
    expect(err.code).toBe("api_error");
    expect(err.message).toContain("post 3");
    expect(err.message).toContain("Rate limited");
  });
});

describe("toPuckError", () => {
  it("converts PuckApiError", () => {
    const err = new PuckApiError("not_found", "Not found");
    const result = toPuckError(err);
    expect(result.error).toBe("not_found");
  });

  it("converts generic Error", () => {
    const err = new Error("Something broke");
    const result = toPuckError(err);
    expect(result.error).toBe("api_error");
    expect(result.message).toBe("Something broke");
  });

  it("converts non-Error values", () => {
    const result = toPuckError("string error");
    expect(result.error).toBe("api_error");
    expect(result.message).toBe("string error");
  });

  it("detects 429 errors as rate limited", () => {
    const err = Object.assign(new Error("Too many requests"), { code: 429 });
    const result = toPuckError(err);
    expect(result.error).toBe("rate_limited");
  });

  it("detects 401 errors as auth failed", () => {
    const err = Object.assign(new Error("Unauthorized"), { code: 401 });
    const result = toPuckError(err);
    expect(result.error).toBe("auth_failed");
  });

  it("detects 403 errors as forbidden", () => {
    const err = Object.assign(new Error("Forbidden"), { code: 403 });
    const result = toPuckError(err);
    expect(result.error).toBe("forbidden");
  });

  it("detects 404 errors as not found", () => {
    const err = Object.assign(new Error("Not found"), { code: 404 });
    const result = toPuckError(err);
    expect(result.error).toBe("not_found");
  });
});
