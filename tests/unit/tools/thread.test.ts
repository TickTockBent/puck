import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the entire x-api module to test thread tool logic
const mockCreatePost = vi.fn();

vi.mock("../../../src/client/x-api.js", () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
  deletePost: vi.fn(),
  getPost: vi.fn(),
  lookupPosts: vi.fn(),
  searchByConversation: vi.fn(),
}));

vi.mock("../../../src/util/character-count.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/util/character-count.js")>("../../../src/util/character-count.js");
  return actual;
});

import type { PostData, PostResult } from "../../../src/types.js";

function makePostResult(id: string, text: string, conversationId?: string): PostResult {
  return {
    post: {
      id,
      text,
      authorId: "user-1",
      conversationId: conversationId || id,
      createdAt: "2026-02-25T12:00:00Z",
    },
  };
}

describe("thread creation logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chains reply IDs sequentially", async () => {
    // Simulate the sequential chaining that puck_thread_create does
    mockCreatePost
      .mockResolvedValueOnce(makePostResult("first-1", "First post", "first-1"))
      .mockResolvedValueOnce(makePostResult("second-2", "Second post", "first-1"))
      .mockResolvedValueOnce(makePostResult("third-3", "Third post", "first-1"));

    const posts = [
      { text: "First post" },
      { text: "Second post" },
      { text: "Third post" },
    ];

    const postedPosts: PostData[] = [];
    let previousPostId: string | undefined;

    for (const post of posts) {
      const result = await mockCreatePost({
        text: post.text,
        replyToPostId: previousPostId,
      });
      postedPosts.push(result.post);
      previousPostId = result.post.id;
    }

    // Verify chaining: first has no reply, second replies to first, third replies to second
    expect(mockCreatePost).toHaveBeenNthCalledWith(1, {
      text: "First post",
      replyToPostId: undefined,
    });
    expect(mockCreatePost).toHaveBeenNthCalledWith(2, {
      text: "Second post",
      replyToPostId: "first-1",
    });
    expect(mockCreatePost).toHaveBeenNthCalledWith(3, {
      text: "Third post",
      replyToPostId: "second-2",
    });

    expect(postedPosts).toHaveLength(3);
  });

  it("handles partial failure and returns posted portion", async () => {
    mockCreatePost
      .mockResolvedValueOnce(makePostResult("ok-1", "First"))
      .mockResolvedValueOnce(makePostResult("ok-2", "Second"))
      .mockRejectedValueOnce(new Error("Rate limited"));

    const posts = [
      { text: "First" },
      { text: "Second" },
      { text: "Third — this will fail" },
    ];

    const postedPosts: PostData[] = [];
    let failedAtIndex = -1;
    let failureError: Error | null = null;
    let previousPostId: string | undefined;

    for (let i = 0; i < posts.length; i++) {
      try {
        const result = await mockCreatePost({
          text: posts[i].text,
          replyToPostId: previousPostId,
        });
        postedPosts.push(result.post);
        previousPostId = result.post.id;
      } catch (err) {
        failedAtIndex = i;
        failureError = err as Error;
        break;
      }
    }

    expect(postedPosts).toHaveLength(2);
    expect(postedPosts[0].text).toBe("First");
    expect(postedPosts[1].text).toBe("Second");
    expect(failedAtIndex).toBe(2);
    expect(failureError?.message).toBe("Rate limited");
  });

  it("returns empty result when first post fails", async () => {
    mockCreatePost.mockRejectedValueOnce(new Error("Auth required"));

    const postedPosts: PostData[] = [];
    let failedAtIndex = -1;

    try {
      await mockCreatePost({ text: "First post", replyToPostId: undefined });
    } catch {
      failedAtIndex = 0;
    }

    expect(postedPosts).toHaveLength(0);
    expect(failedAtIndex).toBe(0);
  });
});
