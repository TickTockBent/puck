import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock twitter-api-v2 before importing anything that uses it
vi.mock("twitter-api-v2", () => {
  const mockV2 = {
    me: vi.fn(),
    tweet: vi.fn(),
    post: vi.fn(),
    deleteTweet: vi.fn(),
    singleTweet: vi.fn(),
    tweets: vi.fn(),
    userTimeline: vi.fn(),
    userMentionTimeline: vi.fn(),
    userByUsername: vi.fn(),
    search: vi.fn(),
  };

  const mockV1 = {
    uploadMedia: vi.fn(),
    createMediaMetadata: vi.fn(),
    mediaInfo: vi.fn(),
  };

  class MockTwitterApi {
    v2 = mockV2;
    v1 = mockV1;
    constructor() {}
    static mockV2 = mockV2;
    static mockV1 = mockV1;
  }

  return { TwitterApi: MockTwitterApi };
});

// Mock auth modules so x-api.ts can get a "valid" token
vi.mock("../../../src/auth/oauth2-pkce.js", () => ({
  getConfig: () => ({
    clientId: "test-client-id",
    redirectUri: "http://localhost:3000/oauth/callback",
    tokenPath: "",
    apiTier: "basic" as const,
    logLevel: "info",
  }),
}));

vi.mock("../../../src/auth/token-manager.js", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
}));

import { TwitterApi } from "twitter-api-v2";
import { createPost, editPost, deletePost, getPost, lookupPosts, getUserTimeline, getUserMentions, searchByConversation } from "../../../src/client/x-api.js";
import { clearRateLimits, updateFromHeaders } from "../../../src/client/rate-limiter.js";
import { RateLimitError } from "../../../src/util/errors.js";

const mockV2 = (TwitterApi as unknown as { mockV2: Record<string, ReturnType<typeof vi.fn>> }).mockV2;
const readBackendEnvKeys = [
  "PUCK_READ_BACKEND",
  "HERMES_TWEET_API_KEY",
  "XQUIK_API_KEY",
  "HERMES_TWEET_BASE_URL",
  "XQUIK_BASE_URL",
  "HERMES_TWEET_TIMEOUT_MS",
  "XQUIK_TIMEOUT_MS",
];

// Standard v2 tweet response shape
function makeTweetResponse(id: string, text: string) {
  return {
    data: {
      id,
      text,
      author_id: "user-1",
      created_at: "2026-02-25T12:00:00Z",
      conversation_id: id,
      edit_history_tweet_ids: [id],
      public_metrics: {
        retweet_count: 0,
        reply_count: 0,
        like_count: 0,
        quote_count: 0,
      },
    },
    includes: {
      users: [{ id: "user-1", name: "Test User", username: "testuser" }],
    },
  };
}

// Standard paginator shape
function makePaginator(tweets: Array<{ id: string; text: string; author_id?: string }>) {
  return {
    tweets: tweets.map((t) => ({
      id: t.id,
      text: t.text,
      author_id: t.author_id || "user-1",
      created_at: "2026-02-25T12:00:00Z",
      public_metrics: { retweet_count: 0, reply_count: 0, like_count: 0, quote_count: 0 },
    })),
    includes: {
      users: [{ id: "user-1", name: "Test User", username: "testuser" }],
    },
    meta: {
      result_count: tweets.length,
      next_token: tweets.length >= 10 ? "next-page-token" : undefined,
    },
    rateLimit: { limit: 450, remaining: 449, reset: Math.floor(Date.now() / 1000) + 900 },
  };
}

function mockHermesFetch(payload: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("x-api client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearRateLimits();
    process.env.PUCK_CLIENT_ID = "test-client-id";
    for (const key of readBackendEnvKeys) {
      delete process.env[key];
    }
  });

  describe("createPost", () => {
    it("creates a post and returns full post data", async () => {
      mockV2.tweet.mockResolvedValue({ data: { id: "post-123", text: "Hello world" } });
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("post-123", "Hello world"));

      const result = await createPost({ text: "Hello world" });

      expect(result.post.id).toBe("post-123");
      expect(result.post.text).toBe("Hello world");
      expect(result.post.authorUsername).toBe("testuser");
      expect(mockV2.tweet).toHaveBeenCalledWith({ text: "Hello world" });
    });

    it("passes reply parameters", async () => {
      mockV2.tweet.mockResolvedValue({ data: { id: "reply-1", text: "Reply text" } });
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("reply-1", "Reply text"));

      await createPost({ text: "Reply text", replyToPostId: "parent-123" });

      expect(mockV2.tweet).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Reply text",
          reply: { in_reply_to_tweet_id: "parent-123" },
        }),
      );
    });

    it("passes media IDs", async () => {
      mockV2.tweet.mockResolvedValue({ data: { id: "media-post", text: "With image" } });
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("media-post", "With image"));

      await createPost({ text: "With image", mediaIds: ["media-1", "media-2"] });

      expect(mockV2.tweet).toHaveBeenCalledWith(
        expect.objectContaining({
          media: { media_ids: ["media-1", "media-2"] },
        }),
      );
    });

    it("throws when rate limited", async () => {
      const futureReset = Math.floor(Date.now() / 1000) + 900;
      updateFromHeaders("POST /2/tweets", {
        "x-rate-limit-limit": "100",
        "x-rate-limit-remaining": "0",
        "x-rate-limit-reset": String(futureReset),
      });

      await expect(createPost({ text: "blocked" })).rejects.toThrow(RateLimitError);
      expect(mockV2.tweet).not.toHaveBeenCalled();
    });
  });

  describe("editPost", () => {
    it("sends edit_options with previous_tweet_id", async () => {
      mockV2.post.mockResolvedValue({ data: { id: "edited-123", text: "Updated text" } });
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("edited-123", "Updated text"));

      const result = await editPost("original-123", { text: "Updated text" });

      expect(result.post.id).toBe("edited-123");
      expect(result.post.text).toBe("Updated text");
      expect(mockV2.post).toHaveBeenCalledWith("tweets", {
        text: "Updated text",
        edit_options: { previous_tweet_id: "original-123" },
      });
    });

    it("includes media IDs when provided", async () => {
      mockV2.post.mockResolvedValue({ data: { id: "edited-456", text: "With media" } });
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("edited-456", "With media"));

      await editPost("original-456", { text: "With media", mediaIds: ["m1"] });

      expect(mockV2.post).toHaveBeenCalledWith("tweets", {
        text: "With media",
        edit_options: { previous_tweet_id: "original-456" },
        media: { media_ids: ["m1"] },
      });
    });

    it("throws when rate limited", async () => {
      const futureReset = Math.floor(Date.now() / 1000) + 900;
      updateFromHeaders("POST /2/tweets", {
        "x-rate-limit-limit": "100",
        "x-rate-limit-remaining": "0",
        "x-rate-limit-reset": String(futureReset),
      });

      await expect(editPost("orig-1", { text: "blocked" })).rejects.toThrow(RateLimitError);
      expect(mockV2.post).not.toHaveBeenCalled();
    });
  });

  describe("deletePost", () => {
    it("deletes a post and returns result", async () => {
      mockV2.deleteTweet.mockResolvedValue({ data: { deleted: true } });

      const result = await deletePost("post-123");
      expect(result.deleted).toBe(true);
      expect(mockV2.deleteTweet).toHaveBeenCalledWith("post-123");
    });
  });

  describe("getPost", () => {
    it("retrieves a post with full field expansion", async () => {
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("post-456", "Fetched post"));

      const result = await getPost("post-456");

      expect(result.post.id).toBe("post-456");
      expect(result.post.text).toBe("Fetched post");
      expect(result.post.authorName).toBe("Test User");
    });

    it("uses Hermes Tweet when explicitly configured", async () => {
      process.env.PUCK_READ_BACKEND = "hermes";
      process.env.HERMES_TWEET_API_KEY = "xq_test";
      const fetchMock = mockHermesFetch({
        tweet: {
          id: "post-789",
          text: "Hermes post",
          author: { id: "user-2", name: "Hermes User", username: "hermesuser" },
          public_metrics: { like_count: 3, retweet_count: 1 },
        },
      });

      const result = await getPost("post-789");

      expect(result.post.id).toBe("post-789");
      expect(result.post.text).toBe("Hermes post");
      expect(result.post.authorUsername).toBe("hermesuser");
      expect(result.post.publicMetrics?.likeCount).toBe(3);
      expect(mockV2.singleTweet).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://xquik.com/api/v1/x/tweets/post-789");
      expect(init).toMatchObject({ headers: { "x-api-key": "xq_test" } });
    });

    it("keeps OAuth as the default when a client ID is present", async () => {
      process.env.HERMES_TWEET_API_KEY = "xq_test";
      const fetchMock = mockHermesFetch({ tweet: { id: "unused", text: "unused" } });
      mockV2.singleTweet.mockResolvedValue(makeTweetResponse("post-456", "Fetched post"));

      const result = await getPost("post-456");

      expect(result.post.text).toBe("Fetched post");
      expect(mockV2.singleTweet).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("lookupPosts", () => {
    it("batch looks up multiple posts", async () => {
      mockV2.tweets.mockResolvedValue({
        data: [
          { id: "1", text: "First", author_id: "user-1" },
          { id: "2", text: "Second", author_id: "user-1" },
        ],
        includes: {
          users: [{ id: "user-1", name: "Test User", username: "testuser" }],
        },
      });

      const result = await lookupPosts(["1", "2"]);

      expect(result.posts).toHaveLength(2);
      expect(result.posts[0].text).toBe("First");
      expect(result.posts[1].text).toBe("Second");
    });
  });

  describe("getUserTimeline", () => {
    it("fetches timeline by userId", async () => {
      mockV2.userTimeline.mockResolvedValue(
        makePaginator([
          { id: "t1", text: "Post one" },
          { id: "t2", text: "Post two" },
        ]),
      );

      const result = await getUserTimeline({ userId: "user-1" });

      expect(result.posts).toHaveLength(2);
      expect(result.resultCount).toBe(2);
      expect(mockV2.userTimeline).toHaveBeenCalledWith("user-1", expect.any(Object));
    });

    it("resolves username to userId first", async () => {
      mockV2.userByUsername.mockResolvedValue({ data: { id: "resolved-id" } });
      mockV2.userTimeline.mockResolvedValue(
        makePaginator([{ id: "t1", text: "Timeline post" }]),
      );

      const result = await getUserTimeline({ username: "testuser" });

      expect(mockV2.userByUsername).toHaveBeenCalledWith("testuser");
      expect(mockV2.userTimeline).toHaveBeenCalledWith("resolved-id", expect.any(Object));
      expect(result.posts).toHaveLength(1);
    });

    it("updates rate limits from paginator response", async () => {
      mockV2.userTimeline.mockResolvedValue(
        makePaginator([{ id: "t1", text: "Post" }]),
      );

      await getUserTimeline({ userId: "user-1" });

      // Rate limit should now be tracked — trying again should work since remaining > 0
      await getUserTimeline({ userId: "user-1" });
      expect(mockV2.userTimeline).toHaveBeenCalledTimes(2);
    });

    it("auto-selects Hermes Tweet for username timelines when no OAuth client is set", async () => {
      delete process.env.PUCK_CLIENT_ID;
      process.env.XQUIK_API_KEY = "xq_test";
      const fetchMock = mockHermesFetch({
        tweets: [
          {
            id: "h1",
            text: "From Hermes",
            author: { id: "user-3", username: "hermes" },
          },
        ],
        nextToken: "next-cursor",
      });

      const result = await getUserTimeline({
        username: "@hermes",
        maxResults: 5,
        paginationToken: "cursor-1",
      });

      expect(result.posts).toHaveLength(1);
      expect(result.nextToken).toBe("next-cursor");
      expect(mockV2.userTimeline).not.toHaveBeenCalled();
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(
        "https://xquik.com/api/v1/x/tweets/search?q=from%3Ahermes&limit=5&cursor=cursor-1",
      );
    });
  });

  describe("getUserMentions", () => {
    it("fetches mentions for authenticated user", async () => {
      mockV2.me.mockResolvedValue({ data: { id: "me-id" } });
      mockV2.userMentionTimeline.mockResolvedValue(
        makePaginator([{ id: "m1", text: "@me hello" }]),
      );

      const result = await getUserMentions({});

      expect(mockV2.me).toHaveBeenCalled();
      expect(mockV2.userMentionTimeline).toHaveBeenCalledWith("me-id", expect.any(Object));
      expect(result.posts).toHaveLength(1);
    });
  });

  describe("searchByConversation", () => {
    it("searches by conversation_id", async () => {
      mockV2.search.mockResolvedValue(
        makePaginator([
          { id: "t1", text: "Thread part 1" },
          { id: "t2", text: "Thread part 2" },
        ]),
      );

      const result = await searchByConversation("conv-123");

      expect(mockV2.search).toHaveBeenCalledWith(
        "conversation_id:conv-123",
        expect.any(Object),
      );
      expect(result.posts).toHaveLength(2);
    });

    it("uses Hermes Tweet thread lookup when configured", async () => {
      process.env.PUCK_READ_BACKEND = "xquik";
      process.env.HERMES_TWEET_API_KEY = "bearer-token";
      const fetchMock = mockHermesFetch({
        tweets: [
          { id: "t1", text: "Thread one", authorId: "user-1" },
          { id: "t2", text: "Thread two", authorId: "user-1" },
        ],
      });

      const result = await searchByConversation("conv-123", 2);

      expect(result.posts).toHaveLength(2);
      expect(mockV2.search).not.toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://xquik.com/api/v1/x/tweets/conv-123/thread?limit=2");
      expect(init).toMatchObject({ headers: { authorization: "Bearer bearer-token" } });
    });
  });
});
