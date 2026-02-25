import { parseTweet } from "twitter-text";
import type { CharacterCountResult } from "../types.js";

export function countCharacters(text: string): CharacterCountResult {
  const parsed = parseTweet(text);
  return {
    weightedLength: parsed.weightedLength,
    maxLength: 280,
    valid: parsed.valid,
    remaining: 280 - parsed.weightedLength,
    displayRange: [parsed.displayRangeStart, parsed.displayRangeEnd],
  };
}

export function validatePostText(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: "Post text cannot be empty" };
  }

  const result = countCharacters(text);

  if (!result.valid) {
    return {
      valid: false,
      error: `Post is ${result.weightedLength} characters (max ${result.maxLength})`,
    };
  }

  return { valid: true };
}
