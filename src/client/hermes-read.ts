import { PuckApiError } from "../util/errors.js";
import type { PostData, PostResult, TimelineParams, TimelineResult } from "../types.js";

type JsonObject = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://xquik.com";
const DEFAULT_TIMEOUT_MS = 30_000;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function stringFrom(source: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function objectFrom(source: JsonObject, keys: string[]): JsonObject | undefined {
  for (const key of keys) {
    const value = source[key];
    if (isObject(value)) {
      return value;
    }
  }
  return undefined;
}

function arrayFrom(source: JsonObject, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

function getApiKey(): string {
  return process.env.HERMES_TWEET_API_KEY || process.env.XQUIK_API_KEY || "";
}

function getBaseUrl(): string {
  return (
    process.env.HERMES_TWEET_BASE_URL ||
    process.env.XQUIK_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
}

function getTimeoutMs(): number {
  const raw = process.env.HERMES_TWEET_TIMEOUT_MS || process.env.XQUIK_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function buildHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new PuckApiError(
      "auth_required",
      "Hermes Tweet read backend requires HERMES_TWEET_API_KEY or XQUIK_API_KEY.",
    );
  }
  if (apiKey.startsWith("xq_")) {
    return { "x-api-key": apiKey };
  }
  return { authorization: `Bearer ${apiKey}` };
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path, `${getBaseUrl()}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function errorCodeForStatus(status: number): "api_error" | "auth_failed" | "forbidden" | "not_found" | "rate_limited" {
  if (status === 401) {
    return "auth_failed";
  }
  if (status === 403) {
    return "forbidden";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "api_error";
}

async function requestHermes(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<unknown> {
  const endpoint = `GET ${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(buildUrl(path, query), {
      method: "GET",
      headers: buildHeaders(),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) as unknown : {};

    if (!response.ok) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      throw new PuckApiError(
        errorCodeForStatus(response.status),
        `Hermes Tweet request failed with HTTP ${response.status}.`,
        {
          endpoint,
          details: payload,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
        },
      );
    }

    return payload;
  } catch (err) {
    if (err instanceof PuckApiError) {
      throw err;
    }
    throw new PuckApiError(
      "api_error",
      `Hermes Tweet request failed: ${err instanceof Error ? err.message : String(err)}`,
      { endpoint },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapSingle(payload: unknown): JsonObject {
  if (!isObject(payload)) {
    return {};
  }
  const nested = objectFrom(payload, ["tweet", "post", "data", "result"]);
  return nested ?? payload;
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isObject(payload)) {
    return [];
  }
  const direct = arrayFrom(payload, ["tweets", "posts", "results", "items", "data"]);
  if (direct) {
    return direct;
  }
  const nested = objectFrom(payload, ["data", "result"]);
  if (nested) {
    return extractItems(nested);
  }
  return [payload];
}

function normalizeMetrics(source: JsonObject): PostData["publicMetrics"] | undefined {
  const metrics = objectFrom(source, ["publicMetrics", "public_metrics", "metrics"]) ?? source;
  const retweetCount = Number(metrics.retweetCount ?? metrics.retweet_count ?? metrics.retweets ?? 0);
  const replyCount = Number(metrics.replyCount ?? metrics.reply_count ?? metrics.replies ?? 0);
  const likeCount = Number(metrics.likeCount ?? metrics.like_count ?? metrics.likes ?? 0);
  const quoteCount = Number(metrics.quoteCount ?? metrics.quote_count ?? metrics.quotes ?? 0);
  const impressionCount = Number(metrics.impressionCount ?? metrics.impression_count ?? metrics.views ?? 0);
  const bookmarkCount = Number(metrics.bookmarkCount ?? metrics.bookmark_count ?? metrics.bookmarks ?? 0);

  if (
    retweetCount === 0 &&
    replyCount === 0 &&
    likeCount === 0 &&
    quoteCount === 0 &&
    impressionCount === 0 &&
    bookmarkCount === 0 &&
    !objectFrom(source, ["publicMetrics", "public_metrics", "metrics"])
  ) {
    return undefined;
  }

  return {
    retweetCount,
    replyCount,
    likeCount,
    quoteCount,
    impressionCount,
    bookmarkCount,
  };
}

function normalizeMedia(source: JsonObject): PostData["media"] | undefined {
  const media = arrayFrom(source, ["media", "attachments"]);
  if (!media) {
    return undefined;
  }
  const normalized = media
    .filter(isObject)
    .map((item) => ({
      mediaKey: stringFrom(item, ["mediaKey", "media_key", "id", "key"]) ?? "",
      type: stringFrom(item, ["type", "mediaType", "media_type"]) ?? "unknown",
      url: stringFrom(item, ["url", "mediaUrl", "media_url"]),
      previewImageUrl: stringFrom(item, ["previewImageUrl", "preview_image_url", "thumbnailUrl"]),
      altText: stringFrom(item, ["altText", "alt_text"]),
      width: Number(item.width ?? 0) || undefined,
      height: Number(item.height ?? 0) || undefined,
    }))
    .filter((item) => item.mediaKey);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeReferences(source: JsonObject): PostData["referencedPosts"] | undefined {
  const references = arrayFrom(source, ["referencedPosts", "referenced_tweets", "references"]);
  if (!references) {
    return undefined;
  }
  const normalized = references
    .filter(isObject)
    .map((item) => ({
      type: (stringFrom(item, ["type"]) ?? "quoted") as "replied_to" | "quoted" | "retweeted",
      id: stringFrom(item, ["id", "tweetId", "tweet_id"]) ?? "",
    }))
    .filter((item) => item.id);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePostData(payload: unknown, fallbackId?: string): PostData {
  const source = unwrapSingle(payload);
  const author = objectFrom(source, ["author", "user", "creator"]) ?? {};
  const id = stringFrom(source, ["id", "tweetId", "tweet_id", "rest_id"]) ?? fallbackId ?? "";

  return {
    id,
    text: stringFrom(source, ["text", "fullText", "full_text", "content"]) ?? "",
    authorId: stringFrom(source, ["authorId", "author_id", "userId", "user_id"]) ??
      stringFrom(author, ["id", "userId", "user_id"]) ??
      "",
    authorName: stringFrom(source, ["authorName", "author_name"]) ??
      stringFrom(author, ["name", "displayName", "display_name"]),
    authorUsername: stringFrom(source, ["authorUsername", "author_username", "username", "screen_name"]) ??
      stringFrom(author, ["username", "screen_name", "handle"]),
    createdAt: stringFrom(source, ["createdAt", "created_at", "timestamp"]),
    conversationId: stringFrom(source, ["conversationId", "conversation_id", "threadId", "thread_id"]),
    inReplyToUserId: stringFrom(source, ["inReplyToUserId", "in_reply_to_user_id"]),
    referencedPosts: normalizeReferences(source),
    publicMetrics: normalizeMetrics(source),
    media: normalizeMedia(source),
    editHistoryTweetIds: arrayFrom(source, ["editHistoryTweetIds", "edit_history_tweet_ids"])
      ?.map(asString)
      .filter((value): value is string => value !== undefined),
  };
}

function normalizeTimeline(payload: unknown): TimelineResult {
  const posts = extractItems(payload).map((item) => normalizePostData(item));
  const meta = isObject(payload) ? objectFrom(payload, ["meta", "pagination"]) ?? payload : {};
  return {
    posts,
    nextToken: stringFrom(meta, ["nextToken", "next_token", "cursor", "nextCursor"]),
    resultCount: Number(meta.resultCount ?? meta.result_count ?? posts.length),
  };
}

function cleanUsername(username: string): string {
  return username.replace(/^@/, "");
}

export function shouldUseHermesReadBackend(): boolean {
  const configured = (process.env.PUCK_READ_BACKEND || "").toLowerCase();
  if (configured === "hermes" || configured === "xquik") {
    return true;
  }
  if (configured === "x" || configured === "twitter" || configured === "oauth") {
    return false;
  }
  return !process.env.PUCK_CLIENT_ID && Boolean(getApiKey());
}

export async function getHermesPost(postId: string): Promise<PostResult> {
  const payload = await requestHermes(`/api/v1/x/tweets/${encodeURIComponent(postId)}`);
  return { post: normalizePostData(payload, postId) };
}

export async function lookupHermesPosts(postIds: string[]): Promise<{ posts: PostData[] }> {
  const results = await Promise.all(postIds.map((postId) => getHermesPost(postId)));
  return { posts: results.map((result) => result.post) };
}

export async function getHermesUserTimeline(params: TimelineParams): Promise<TimelineResult> {
  const limit = params.maxResults ?? 10;
  if (params.username) {
    return normalizeTimeline(
      await requestHermes("/api/v1/x/tweets/search", {
        q: `from:${cleanUsername(params.username)}`,
        limit,
        cursor: params.paginationToken,
      }),
    );
  }
  if (params.userId) {
    return normalizeTimeline(
      await requestHermes(`/api/v1/x/users/${encodeURIComponent(params.userId)}/tweets`, {
        limit,
        cursor: params.paginationToken,
      }),
    );
  }
  throw new PuckApiError("invalid_request", "Either userId or username is required");
}

export async function searchHermesConversation(conversationId: string, maxResults: number): Promise<TimelineResult> {
  return normalizeTimeline(
    await requestHermes(`/api/v1/x/tweets/${encodeURIComponent(conversationId)}/thread`, {
      limit: Math.min(maxResults, 100),
    }),
  );
}
