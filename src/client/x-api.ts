import { TwitterApi } from "twitter-api-v2";
import type {
  TweetV2,
  UserV2,
  MediaObjectV2,
  Tweetv2FieldsParams,
  TweetV2PaginableTimelineParams,
  TweetV2UserTimelineParams,
} from "twitter-api-v2";
import { getConfig } from "../auth/oauth2-pkce.js";
import { getValidAccessToken } from "../auth/token-manager.js";
import {
  checkRateLimit,
  decrementRemaining,
  updateFromHeaders,
  normalizeEndpoint,
} from "./rate-limiter.js";
import {
  DEFAULT_TWEET_FIELDS,
  DEFAULT_USER_FIELDS,
  DEFAULT_MEDIA_FIELDS,
  DEFAULT_EXPANSIONS,
} from "./fields.js";
import { toPuckError, PuckApiError } from "../util/errors.js";
import type {
  PostData,
  PostCreateParams,
  PostResult,
  TimelineParams,
  TimelineResult,
} from "../types.js";

async function getClient(): Promise<TwitterApi> {
  const config = getConfig();
  const accessToken = await getValidAccessToken(config.clientId);
  return new TwitterApi(accessToken);
}

function mapTweetToPostData(
  tweet: TweetV2,
  includes?: {
    users?: UserV2[];
    media?: MediaObjectV2[];
  },
): PostData {
  const author = includes?.users?.find((u) => u.id === tweet.author_id);

  const postData: PostData = {
    id: tweet.id,
    text: tweet.text,
    authorId: tweet.author_id || "",
    authorName: author?.name,
    authorUsername: author?.username,
    createdAt: tweet.created_at,
    conversationId: tweet.conversation_id,
    inReplyToUserId: tweet.in_reply_to_user_id,
  };

  if (tweet.referenced_tweets) {
    postData.referencedPosts = tweet.referenced_tweets.map((ref) => ({
      type: ref.type as "replied_to" | "quoted" | "retweeted",
      id: ref.id,
    }));
  }

  if (tweet.public_metrics) {
    const metrics = tweet.public_metrics;
    postData.publicMetrics = {
      retweetCount: metrics.retweet_count,
      replyCount: metrics.reply_count,
      likeCount: metrics.like_count,
      quoteCount: metrics.quote_count ?? 0,
      impressionCount: (metrics as unknown as Record<string, number>).impression_count ?? 0,
      bookmarkCount: (metrics as unknown as Record<string, number>).bookmark_count ?? 0,
    };
  }

  if (tweet.attachments?.media_keys && includes?.media) {
    postData.media = tweet.attachments.media_keys
      .map((key) => {
        const mediaObj = includes.media!.find((m) => m.media_key === key);
        if (!mediaObj) return null;
        return {
          mediaKey: mediaObj.media_key,
          type: mediaObj.type,
          url: mediaObj.url,
          previewImageUrl: mediaObj.preview_image_url,
          altText: mediaObj.alt_text,
          width: mediaObj.width,
          height: mediaObj.height,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }

  if (tweet.edit_history_tweet_ids) {
    postData.editHistoryTweetIds = tweet.edit_history_tweet_ids;
  }

  if (tweet.edit_controls) {
    postData.editControls = {
      editsRemaining: tweet.edit_controls.edits_remaining,
      isEditEligible: tweet.edit_controls.is_edit_eligible,
      editableUntil: tweet.edit_controls.editable_until,
    };
  }

  return postData;
}

const tweetFieldsParam: Partial<Tweetv2FieldsParams> = {
  "tweet.fields": DEFAULT_TWEET_FIELDS.join(","),
  "user.fields": DEFAULT_USER_FIELDS.join(","),
  "media.fields": DEFAULT_MEDIA_FIELDS.join(","),
  expansions: DEFAULT_EXPANSIONS.join(","),
};

export async function createPost(params: PostCreateParams): Promise<PostResult> {
  const endpoint = normalizeEndpoint("POST", "/2/tweets");
  checkRateLimit(endpoint);

  const client = await getClient();

  const body: Record<string, unknown> = { text: params.text };

  if (params.replyToPostId) {
    body.reply = { in_reply_to_tweet_id: params.replyToPostId };
  }
  if (params.quotePostId) {
    body.quote_tweet_id = params.quotePostId;
  }
  if (params.mediaIds && params.mediaIds.length > 0) {
    body.media = { media_ids: params.mediaIds };
  }
  if (params.replySettings) {
    body.reply_settings = params.replySettings;
  }
  if (params.poll) {
    body.poll = {
      options: params.poll.options,
      duration_minutes: params.poll.durationMinutes,
    };
  }

  try {
    const response = await client.v2.tweet(body as Parameters<typeof client.v2.tweet>[0]);
    decrementRemaining(endpoint);

    // Fetch the full post to get all fields
    const fullPost = await getPost(response.data.id);
    return fullPost;
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to create post: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function deletePost(postId: string): Promise<{ deleted: boolean }> {
  const endpoint = normalizeEndpoint("DELETE", "/2/tweets/:id");
  checkRateLimit(endpoint);

  const client = await getClient();

  try {
    const response = await client.v2.deleteTweet(postId);
    decrementRemaining(endpoint);
    return { deleted: response.data.deleted };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to delete post: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function getPost(postId: string): Promise<PostResult> {
  const endpoint = normalizeEndpoint("GET", "/2/tweets/:id");
  checkRateLimit(endpoint);

  const client = await getClient();

  try {
    const response = await client.v2.singleTweet(postId, tweetFieldsParam);
    decrementRemaining(endpoint);

    const post = mapTweetToPostData(response.data, response.includes);
    return { post };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to get post: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function lookupPosts(postIds: string[]): Promise<{ posts: PostData[] }> {
  const endpoint = normalizeEndpoint("GET", "/2/tweets");
  checkRateLimit(endpoint);

  const client = await getClient();

  try {
    const response = await client.v2.tweets(postIds, tweetFieldsParam);
    decrementRemaining(endpoint);

    const posts = (response.data || []).map((tweet) =>
      mapTweetToPostData(tweet, response.includes),
    );
    return { posts };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to lookup posts: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function getUserTimeline(params: TimelineParams): Promise<TimelineResult> {
  const endpoint = normalizeEndpoint("GET", "/2/users/:id/tweets");
  checkRateLimit(endpoint);

  const client = await getClient();

  let userId = params.userId;
  if (!userId && params.username) {
    const userResponse = await client.v2.userByUsername(params.username);
    userId = userResponse.data.id;
  }
  if (!userId) {
    throw new PuckApiError("invalid_request", "Either userId or username is required");
  }

  try {
    const paginator = await client.v2.userTimeline(userId, {
      ...tweetFieldsParam as Partial<TweetV2UserTimelineParams>,
      max_results: params.maxResults || 10,
      pagination_token: params.paginationToken,
    });
    decrementRemaining(endpoint);

    // Update rate limits from paginator
    if (paginator.rateLimit) {
      updateFromHeaders(endpoint, {
        "x-rate-limit-limit": String(paginator.rateLimit.limit),
        "x-rate-limit-remaining": String(paginator.rateLimit.remaining),
        "x-rate-limit-reset": String(paginator.rateLimit.reset),
      });
    }

    const tweets = paginator.tweets;
    const posts = tweets.map((tweet) =>
      mapTweetToPostData(tweet, paginator.includes),
    );

    return {
      posts,
      nextToken: paginator.meta?.next_token,
      resultCount: paginator.meta?.result_count ?? posts.length,
    };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to get user timeline: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function getUserMentions(params: TimelineParams): Promise<TimelineResult> {
  const endpoint = normalizeEndpoint("GET", "/2/users/:id/mentions");
  checkRateLimit(endpoint);

  const client = await getClient();

  let userId = params.userId;
  if (!userId) {
    const meResponse = await client.v2.me();
    userId = meResponse.data.id;
  }

  try {
    const paginator = await client.v2.userMentionTimeline(userId, {
      ...tweetFieldsParam as Partial<TweetV2PaginableTimelineParams>,
      max_results: params.maxResults || 10,
      pagination_token: params.paginationToken,
    });
    decrementRemaining(endpoint);

    if (paginator.rateLimit) {
      updateFromHeaders(endpoint, {
        "x-rate-limit-limit": String(paginator.rateLimit.limit),
        "x-rate-limit-remaining": String(paginator.rateLimit.remaining),
        "x-rate-limit-reset": String(paginator.rateLimit.reset),
      });
    }

    const tweets = paginator.tweets;
    const posts = tweets.map((tweet) =>
      mapTweetToPostData(tweet, paginator.includes),
    );

    return {
      posts,
      nextToken: paginator.meta?.next_token,
      resultCount: paginator.meta?.result_count ?? posts.length,
    };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to get mentions: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function getMe(): Promise<PostData> {
  const endpoint = normalizeEndpoint("GET", "/2/users/me");
  checkRateLimit(endpoint);

  const client = await getClient();

  try {
    const response = await client.v2.me({
      "user.fields": DEFAULT_USER_FIELDS.join(","),
    });
    decrementRemaining(endpoint);

    return {
      id: response.data.id,
      text: "",
      authorId: response.data.id,
      authorName: response.data.name,
      authorUsername: response.data.username,
    };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to get authenticated user: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}

export async function searchByConversation(conversationId: string, maxResults = 100): Promise<TimelineResult> {
  const endpoint = normalizeEndpoint("GET", "/2/tweets/search/recent");
  checkRateLimit(endpoint);

  const client = await getClient();

  try {
    const paginator = await client.v2.search(`conversation_id:${conversationId}`, {
      ...tweetFieldsParam,
      max_results: Math.min(maxResults, 100),
    });
    decrementRemaining(endpoint);

    if (paginator.rateLimit) {
      updateFromHeaders(endpoint, {
        "x-rate-limit-limit": String(paginator.rateLimit.limit),
        "x-rate-limit-remaining": String(paginator.rateLimit.remaining),
        "x-rate-limit-reset": String(paginator.rateLimit.reset),
      });
    }

    const tweets = paginator.tweets;
    const posts = tweets.map((tweet) =>
      mapTweetToPostData(tweet, paginator.includes),
    );

    return {
      posts,
      nextToken: paginator.meta?.next_token,
      resultCount: paginator.meta?.result_count ?? posts.length,
    };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to search conversation: ${err instanceof Error ? err.message : err}`, {
      details: toPuckError(err),
    });
  }
}
