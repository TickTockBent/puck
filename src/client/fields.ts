export const DEFAULT_TWEET_FIELDS = [
  "created_at",
  "author_id",
  "conversation_id",
  "in_reply_to_user_id",
  "referenced_tweets",
  "public_metrics",
  "edit_history_tweet_ids",
  "edit_controls",
  "attachments",
  "text",
] as const;

export const DEFAULT_USER_FIELDS = [
  "name",
  "username",
  "profile_image_url",
  "verified",
  "verified_type",
  "public_metrics",
  "description",
] as const;

export const DEFAULT_MEDIA_FIELDS = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "alt_text",
  "width",
  "height",
] as const;

export const DEFAULT_EXPANSIONS = [
  "author_id",
  "attachments.media_keys",
  "referenced_tweets.id",
  "in_reply_to_user_id",
] as const;

export interface TweetQueryParams {
  "tweet.fields": string;
  "user.fields": string;
  "media.fields": string;
  expansions: string;
}

export function buildTweetQueryParams(overrides?: Partial<TweetQueryParams>): TweetQueryParams {
  return {
    "tweet.fields": overrides?.["tweet.fields"] ?? DEFAULT_TWEET_FIELDS.join(","),
    "user.fields": overrides?.["user.fields"] ?? DEFAULT_USER_FIELDS.join(","),
    "media.fields": overrides?.["media.fields"] ?? DEFAULT_MEDIA_FIELDS.join(","),
    expansions: overrides?.expansions ?? DEFAULT_EXPANSIONS.join(","),
  };
}
