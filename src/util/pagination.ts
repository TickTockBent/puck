import type { PostData, TimelineResult } from "../types.js";

const DEFAULT_MAX_PAGES = 5;

export interface PaginationOptions {
  maxPages?: number;
}

export function buildTimelineResult(
  posts: PostData[],
  nextToken?: string,
): TimelineResult {
  return {
    posts,
    nextToken,
    resultCount: posts.length,
  };
}

export function getMaxPages(options?: PaginationOptions): number {
  return options?.maxPages ?? DEFAULT_MAX_PAGES;
}
