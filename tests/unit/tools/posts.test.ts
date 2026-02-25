import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePostText } from "../../../src/util/character-count.js";

// Unit tests for post validation logic — API interaction tests would be integration tests

describe("post creation validation", () => {
  it("rejects empty posts", () => {
    const result = validatePostText("");
    expect(result.valid).toBe(false);
  });

  it("accepts valid posts", () => {
    const result = validatePostText("Hello world, this is a test post!");
    expect(result.valid).toBe(true);
  });

  it("rejects posts over 280 characters", () => {
    const result = validatePostText("a".repeat(281));
    expect(result.valid).toBe(false);
  });

  it("accounts for URL weighting in validation", () => {
    // URL counts as 23 chars, not actual length
    const text = "Check this: https://example.com/very/long/url/that/is/definitely/over/23/characters/in/real/length";
    const result = validatePostText(text);
    expect(result.valid).toBe(true);
  });
});

describe("thread validation", () => {
  it("validates each post independently", () => {
    const posts = [
      "First post in thread",
      "Second post with a URL https://example.com",
      "a".repeat(281), // too long
    ];

    const results = posts.map((text) => validatePostText(text));
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(true);
    expect(results[2].valid).toBe(false);
  });

  it("treats each post as independent 280-char limit", () => {
    // Even if total thread is long, each post must be ≤280
    const posts = Array.from({ length: 10 }, (_, i) => `Post ${i + 1}: ${"x".repeat(250)}`);
    const results = posts.map((text) => validatePostText(text));
    results.forEach((result) => {
      expect(result.valid).toBe(true);
    });
  });
});
