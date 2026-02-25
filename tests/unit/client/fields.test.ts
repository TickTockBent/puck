import { describe, it, expect } from "vitest";
import {
  DEFAULT_TWEET_FIELDS,
  DEFAULT_USER_FIELDS,
  DEFAULT_MEDIA_FIELDS,
  DEFAULT_EXPANSIONS,
  buildTweetQueryParams,
} from "../../../src/client/fields.js";

describe("field constants", () => {
  it("includes expected tweet fields", () => {
    expect(DEFAULT_TWEET_FIELDS).toContain("created_at");
    expect(DEFAULT_TWEET_FIELDS).toContain("author_id");
    expect(DEFAULT_TWEET_FIELDS).toContain("public_metrics");
    expect(DEFAULT_TWEET_FIELDS).toContain("edit_controls");
  });

  it("includes expected user fields", () => {
    expect(DEFAULT_USER_FIELDS).toContain("username");
    expect(DEFAULT_USER_FIELDS).toContain("name");
    expect(DEFAULT_USER_FIELDS).toContain("profile_image_url");
  });

  it("includes expected media fields", () => {
    expect(DEFAULT_MEDIA_FIELDS).toContain("media_key");
    expect(DEFAULT_MEDIA_FIELDS).toContain("type");
    expect(DEFAULT_MEDIA_FIELDS).toContain("alt_text");
  });

  it("includes expected expansions", () => {
    expect(DEFAULT_EXPANSIONS).toContain("author_id");
    expect(DEFAULT_EXPANSIONS).toContain("attachments.media_keys");
  });
});

describe("buildTweetQueryParams", () => {
  it("returns comma-separated defaults", () => {
    const params = buildTweetQueryParams();
    expect(params["tweet.fields"]).toContain("created_at");
    expect(params["tweet.fields"]).toContain(",");
    expect(params["user.fields"]).toContain("username");
    expect(params.expansions).toContain("author_id");
  });

  it("applies overrides", () => {
    const params = buildTweetQueryParams({
      "tweet.fields": "id,text",
    });
    expect(params["tweet.fields"]).toBe("id,text");
    // Other fields should still be defaults
    expect(params["user.fields"]).toContain("username");
  });
});
