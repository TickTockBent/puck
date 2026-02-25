import { describe, it, expect } from "vitest";
import { countCharacters, validatePostText } from "../../../src/util/character-count.js";

describe("countCharacters", () => {
  it("counts plain text correctly", () => {
    const result = countCharacters("Hello world");
    expect(result.weightedLength).toBe(11);
    expect(result.valid).toBe(true);
    expect(result.remaining).toBe(269);
  });

  it("counts URLs as 23 characters", () => {
    const result = countCharacters("Check out https://example.com/some/very/long/path/that/is/way/more/than/23/characters");
    // "Check out " = 10, URL = 23 → 33
    expect(result.weightedLength).toBe(33);
    expect(result.valid).toBe(true);
  });

  it("counts emoji as 2 characters each", () => {
    const result = countCharacters("Hello 😀");
    // "Hello " = 6, emoji = 2 → 8
    expect(result.weightedLength).toBe(8);
    expect(result.valid).toBe(true);
  });

  it("marks text over 280 as invalid", () => {
    const longText = "a".repeat(281);
    const result = countCharacters(longText);
    expect(result.weightedLength).toBe(281);
    expect(result.valid).toBe(false);
    expect(result.remaining).toBe(-1);
  });

  it("allows exactly 280 characters", () => {
    const text = "a".repeat(280);
    const result = countCharacters(text);
    expect(result.weightedLength).toBe(280);
    expect(result.valid).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("handles empty string (twitter-text marks as invalid)", () => {
    const result = countCharacters("");
    expect(result.weightedLength).toBe(0);
    // twitter-text's parseTweet treats empty as invalid
    expect(result.valid).toBe(false);
  });
});

describe("validatePostText", () => {
  it("returns valid for normal text", () => {
    const result = validatePostText("Hello world");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns invalid for empty text", () => {
    const result = validatePostText("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("returns invalid for whitespace-only text", () => {
    const result = validatePostText("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("returns invalid for text over 280 characters", () => {
    const result = validatePostText("a".repeat(281));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("281");
    expect(result.error).toContain("280");
  });
});
