# Puck

**X/Twitter MCP Connector**

*"Lord, what fools these mortals be!"*

---

Puck is an [MCP](https://modelcontextprotocol.io) server that exposes the full X (Twitter) API v2 as tools. It handles OAuth 2.0 PKCE with automatic token rotation, rate limit tracking across tiers, chunked media uploads, and thread construction so consuming applications don't have to.

Named for the mischievous sprite from Shakespeare's *A Midsummer Night's Dream* — quick, everywhere at once, short utterances that cause outsized reactions. Public domain by four centuries.

## Quick Start

### 1. X Developer Setup

1. Create a project at [developer.x.com](https://developer.x.com)
2. Select **Basic** tier ($200/mo) or higher — Free tier is insufficient for meaningful use
3. Create an **OAuth 2.0 App** with Type: "Web App" (for PKCE flow)
4. Add `http://localhost:3000/oauth/callback` as a redirect URI
5. Note your Client ID (public) — no client secret needed for PKCE
6. Enable the required scopes (see [Authentication](#authentication))

### 2. MCP Configuration

Add Puck to your MCP client configuration:

```json
{
  "mcpServers": {
    "puck": {
      "command": "npx",
      "args": ["@ticktockbent/puck"],
      "env": {
        "PUCK_CLIENT_ID": "your_oauth2_client_id"
      }
    }
  }
}
```

### 3. First Run

On first connection, Puck opens your browser for X OAuth consent. Once authorized, tokens are encrypted and stored locally at `~/.puck/tokens.json`. Access tokens refresh automatically (2-hour expiry with rotating refresh tokens). Subsequent runs authenticate silently.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PUCK_CLIENT_ID` | Yes | X OAuth 2.0 Client ID |
| `PUCK_REDIRECT_URI` | No | OAuth callback URI (default: `http://localhost:3000/oauth/callback`) |
| `PUCK_TOKEN_PATH` | No | Token storage location (default: `~/.puck/tokens.json`) |
| `PUCK_API_TIER` | No | API tier for rate limit tracking: `free`, `basic`, `pro`, `enterprise` (default: `basic`) |
| `PUCK_LOG_LEVEL` | No | Logging level (default: `info`) |

## Tools

### Authentication

| Tool | Description |
| --- | --- |
| `puck_auth_status` | Check authentication state, username, scopes, token expiry, and API tier |
| `puck_auth_logout` | Revoke tokens and clear stored credentials |
| `puck_rate_status` | Show current rate limit state across all endpoint groups |

### Posts

| Tool | Description |
| --- | --- |
| `puck_post_create` | Create a post (supports text, polls, reply settings, geo, quote tweets) |
| `puck_post_edit` | Edit a post within the 30-minute / 5-edit window |
| `puck_post_delete` | Delete a post |
| `puck_post_get` | Get a post by ID with full field expansion |
| `puck_post_lookup` | Batch lookup posts by IDs (up to 100) |

### Threads

| Tool | Description |
| --- | --- |
| `puck_thread_create` | Create a thread from an array of post objects (handles chained reply IDs automatically) |
| `puck_thread_get` | Get all posts in a thread by conversation ID |

### Media

| Tool | Description |
| --- | --- |
| `puck_media_upload` | Upload media (image, GIF, or video) via chunked upload with automatic polling for processing completion |
| `puck_media_status` | Check processing status of an in-progress upload |

### Timelines

| Tool | Description |
| --- | --- |
| `puck_timeline_home` | Get the authenticated user's home timeline (reverse chronological) |
| `puck_timeline_user` | Get a user's posts by user ID or username |
| `puck_timeline_mentions` | Get the authenticated user's mentions |

### Search

| Tool | Description |
| --- | --- |
| `puck_search` | Search recent posts (last 7 days) using X query operators |
| `puck_search_archive` | Full-archive search (Pro/Enterprise only) |

### Engagement

| Tool | Description |
| --- | --- |
| `puck_like` | Like a post |
| `puck_unlike` | Unlike a post |
| `puck_retweet` | Retweet a post |
| `puck_unretweet` | Undo a retweet |
| `puck_bookmark_add` | Bookmark a post |
| `puck_bookmark_remove` | Remove a bookmark |
| `puck_bookmarks_list` | List bookmarked posts with pagination |
| `puck_reply_hide` | Hide a reply to one of your posts |
| `puck_reply_unhide` | Unhide a reply |

### Users

| Tool | Description |
| --- | --- |
| `puck_user_me` | Get the authenticated user's profile |
| `puck_user_get` | Get a user by ID |
| `puck_user_by_username` | Get a user by @username |
| `puck_user_lookup` | Batch lookup users by IDs (up to 100) |
| `puck_follow` | Follow a user (Enterprise tier may be required) |
| `puck_unfollow` | Unfollow a user |
| `puck_mute` | Mute a user |
| `puck_unmute` | Unmute a user |

### Direct Messages

| Tool | Description |
| --- | --- |
| `puck_dm_send` | Send a DM to a user (1-to-1) |
| `puck_dm_send_group` | Send a DM to a group conversation |
| `puck_dm_list` | List recent DM events (last 30 days) |
| `puck_dm_conversation` | Get DM events for a specific conversation |

### Lists

| Tool | Description |
| --- | --- |
| `puck_list_create` | Create a list |
| `puck_list_update` | Update a list's name or description |
| `puck_list_delete` | Delete a list |
| `puck_list_get` | Get a list by ID |
| `puck_list_members` | Get members of a list |
| `puck_list_member_add` | Add a user to a list |
| `puck_list_member_remove` | Remove a user from a list |
| `puck_list_posts` | Get posts from a list's timeline |

### Streaming

| Tool | Description |
| --- | --- |
| `puck_stream_rules_list` | List current filtered stream rules |
| `puck_stream_rules_add` | Add filtered stream rules |
| `puck_stream_rules_delete` | Delete filtered stream rules |
| `puck_stream_connect` | Connect to filtered stream (returns posts matching rules) |

### Trends

| Tool | Description |
| --- | --- |
| `puck_trends` | Get trending topics by location (WOEID) |

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio transport)
├── types.ts              # TypeScript interfaces and X API types
├── auth/
│   ├── oauth2-pkce.ts    # OAuth 2.0 PKCE flow, browser consent, token exchange
│   ├── token-manager.ts  # Proactive refresh, rotation handling, encrypted persistence
│   └── storage.ts        # Encrypted token storage (~/.puck/)
├── client/
│   ├── x-api.ts          # X API v2 client wrapper
│   ├── rate-limiter.ts   # Per-endpoint rate limit tracking with tier awareness
│   ├── media.ts          # Chunked upload pipeline (initialize → append → finalize → poll)
│   └── fields.ts         # Field/expansion builder for v2 response shaping
├── tools/
│   ├── auth.ts           # Auth status and logout tools
│   ├── posts.ts          # Post CRUD and thread construction
│   ├── media.ts          # Media upload tools
│   ├── timelines.ts      # Timeline tools
│   ├── search.ts         # Search tools
│   ├── engagement.ts     # Likes, retweets, bookmarks, reply hiding
│   ├── users.ts          # User lookup, follow, mute
│   ├── dms.ts            # Direct message tools
│   ├── lists.ts          # List management tools
│   ├── streaming.ts      # Filtered stream tools
│   └── trends.ts         # Trends tools
└── util/
    ├── character-count.ts # Accurate tweet length calculation (URLs=23, emoji=2, etc.)
    ├── pagination.ts      # Cursor-based pagination helper
    └── errors.ts          # Typed error classes
```

### Key Design Decisions

* **Stateless** — No caching of API responses. Each tool call hits the X API directly. Rate limit state is the sole exception.
* **Single account** — One X account per server instance. Run multiple instances for multiple accounts.
* **V2 only** — No v1.1 endpoints. The entire API surface uses `api.x.com/2/`.
* **Tier-aware rate limiting** — Rate limits vary dramatically between Free, Basic, Pro, and Enterprise. Puck tracks per-endpoint consumption against the configured tier and returns structured errors with retry timing when limits approach.
* **Proactive token refresh** — Access tokens expire every 2 hours. Puck refreshes when <15 minutes remain rather than waiting for a 401. Refresh tokens are single-use with rotation — each refresh yields a new refresh token that must be persisted atomically.
* **Encrypted storage** — Tokens at rest are AES-256-CBC encrypted using a machine-specific derived key, consistent with the pattern established in Moist.
* **Thread construction** — `puck_thread_create` accepts an array and handles the sequential post-then-reply-with-id chain internally, including error recovery for partial thread creation.
* **No scheduling** — The X API has no native scheduling endpoint. Scheduling belongs at the orchestration layer (Jeeves), not the connector. Puck posts when told to post.

## Authentication

### OAuth 2.0 PKCE Flow

Puck uses the Authorization Code flow with PKCE (Proof Key for Code Exchange) as recommended by X for user-context applications. No client secret is required.

**Flow:**
1. Generate `code_verifier` (random 128 bytes, base64url)
2. Derive `code_challenge` via SHA-256
3. Open browser to `https://x.com/i/oauth2/authorize` with scopes
4. User authorizes → redirect to callback with `code`
5. Exchange code at `https://api.x.com/2/oauth2/token`
6. Receive access token (2hr) + refresh token (~6mo, single-use)
7. Persist both tokens encrypted at rest

**Required scopes:**

| Scope | Purpose |
| --- | --- |
| `tweet.read` | Read posts, timelines, search |
| `tweet.write` | Create, edit, delete posts |
| `tweet.moderate.write` | Hide/unhide replies |
| `users.read` | User profiles (required by most endpoints) |
| `like.read` | Read liked posts |
| `like.write` | Like/unlike |
| `bookmark.read` | Read bookmarks |
| `bookmark.write` | Add/remove bookmarks |
| `list.read` | Read lists |
| `list.write` | Manage lists |
| `dm.read` | Read DMs |
| `dm.write` | Send DMs |
| `follows.read` | Read follows |
| `follows.write` | Follow/unfollow |
| `mute.read` | Read mutes |
| `mute.write` | Mute/unmute |
| `media.write` | Upload media |
| `space.read` | Read Spaces metadata |
| `offline.access` | Receive refresh tokens |

### Token Management

Refresh tokens are **single-use with rotation**. Each refresh request returns a new access token AND a new refresh token, invalidating the previous refresh token. If the new refresh token is lost (crash during write), the user must re-authorize. Puck handles this by:

1. Performing the refresh request
2. Writing the new token pair to a temporary file
3. Atomically renaming the temp file over the token file
4. Only then using the new access token

This prevents the "lost refresh token" failure mode that bricks the session.

## Rate Limiting

### Strategy

Puck maintains an in-memory rate limit tracker populated from `x-rate-limit-*` response headers. Each endpoint group tracks its own 15-minute window (or 24-hour window on Free tier).

When a tool call would exceed a known limit, Puck returns a structured error *before* making the API call:

```json
{
  "error": "rate_limited",
  "message": "POST /2/tweets rate limit reached (100/15min). Resets in 340 seconds.",
  "endpoint": "POST /2/tweets",
  "limit": 100,
  "remaining": 0,
  "resetAt": "2026-02-25T15:30:00Z",
  "retryAfter": 340
}
```

### Per-Tier Limits (Key Endpoints)

| Endpoint | Free | Basic | Pro | Enterprise |
| --- | --- | --- | --- | --- |
| `POST /2/tweets` | 500/mo total | 100/15min, 50K/mo | 100/15min, 300K/mo | Custom |
| `GET /2/tweets/:id` | Minimal | 450/15min (app) | 450/15min | Custom |
| `GET /2/tweets/search/recent` | None | 450/15min (app), 300/15min (user) | 450/15min | Custom |
| `GET /2/users/:id/timelines` | None | 180/15min (user) | 180/15min | Custom |
| `POST /2/media/upload/*` | 17/24hrs (!!) | 500/15min | 500/15min | Custom |
| DM send | None | 15/15min, 1,440/24hrs | Same | Custom |

### Monthly Consumption Caps

Independent of per-request rate limits, each tier has a monthly cap on total post data retrieved:

| Tier | Monthly post cap |
| --- | --- |
| Free | ~100 reads |
| Basic | 500,000 posts |
| Pro | 2,000,000+ posts |
| Pay-per-use | 2,000,000 posts |

## Media Upload Pipeline

Media upload is the most complex operation in the X API. Puck abstracts it into a single tool call.

### `puck_media_upload` Internal Flow

```
Input: file path or buffer, media type
  │
  ├─ If image ≤5MB: simple upload (single POST)
  │
  └─ Otherwise: chunked upload
       │
       ├─ INITIALIZE (media_type, total_bytes, media_category)
       │    → returns media_id
       │
       ├─ APPEND (loop: ≤5MB chunks with segment_index)
       │    → each chunk acknowledged
       │
       ├─ FINALIZE
       │    → may return processing_info
       │
       └─ POLL STATUS (if processing_info present)
            → loop with exponential backoff until state=succeeded
            → timeout after 5 minutes for video
```

### Media Constraints

| Type | Formats | Max size | Per-post limit | Notes |
| --- | --- | --- | --- | --- |
| Image | JPG, PNG, WebP | 5 MB | 4 | Static GIFs treated as images |
| Animated GIF | GIF | 15 MB | 1 | ≤1280×1080, ≤350 frames |
| Video | MP4 (H.264/AAC) | 512 MB | 1 | 0.5–140s, ≤60fps |

Media IDs expire (~24hrs for images, ~15 days for video). There is no standalone audio upload — audio exists only within video files.

Alt text should be set via `puck_media_upload`'s `alt_text` parameter (≤1,000 chars), applied after upload but before attaching to a post.

## Content Formatting

Puck includes a `character-count` utility that accurately calculates post length using X's rules:

* **Standard limit:** 280 characters (25,000 for Premium subscribers)
* **URLs:** Always count as exactly 23 characters regardless of actual length (t.co wrapping)
* **Emoji:** Count as 2 characters each
* **@mentions at reply start:** Don't count toward the limit
* **@mentions in body text:** Do count
* **Media attachments:** Don't count toward the character limit
* **Daily post cap:** 2,400 per user per day (including retweets and replies)

The `twitter-text` npm package handles the edge cases. Puck validates content length before submitting to the API and returns a clear error if it would exceed limits.

## Error Handling

All tools return consistent error shapes:

```json
{
  "error": "not_found",
  "message": "Human-readable description",
  "details": {}
}
```

| Error Code | Meaning |
| --- | --- |
| `not_found` | Post, user, list, or conversation doesn't exist |
| `rate_limited` | Endpoint rate limit hit (includes `retryAfter`) |
| `monthly_cap` | Monthly consumption cap reached |
| `auth_failed` | Token expired/revoked and refresh failed |
| `auth_required` | Operation requires re-authorization |
| `forbidden` | Insufficient permissions or tier for this endpoint |
| `invalid_request` | Bad parameters (includes validation details) |
| `content_too_long` | Post exceeds character limit (includes count) |
| `media_failed` | Media upload or processing failed (includes stage) |
| `edit_expired` | Post is past the 30-minute edit window |
| `edit_limit` | Post has reached the 5-edit maximum |
| `reply_restricted` | Cannot reply — original author hasn't mentioned you (API limitation on non-Enterprise) |
| `api_error` | X API error (details included) |

## X API Tier Considerations

### Free Tier ($0)

Essentially useless. 500 posts/month write cap, ~100 reads, no search, no DMs, no streaming, no trends. 24-hour rate windows instead of 15-minute. Media upload limit of 17 operations per 24 hours makes image posting nearly impractical. Suitable only for initial OAuth flow testing.

### Basic Tier ($200/mo) — Recommended minimum

50,000 posts/month, 15,000 read requests/month, 500K post consumption cap. Access to recent search, filtered stream, bookmarks, lists, DMs. 15-minute rate windows. Sufficient for a single-user or small-team tool.

### Pro Tier ($5,000/mo)

300,000 posts/month, 1M read requests/month, full-archive search, priority support. Relevant when scaling to multiple users or heavy read patterns.

### Pay-Per-Use (credit-based)

New default since February 2026. Purchase credits upfront, each API request deducts at per-endpoint rates. Auto-recharge and spending caps available. 2M post read cap (same as Pro). Good for unpredictable or bursty usage patterns. Deduplicates identical requests within 24-hour windows.

### Enterprise ($42,000+/mo)

Required for: followers/following endpoints, full-archive search at scale, firehose streaming, SLAs. Not relevant for Puck MVP.

## Developer Policy Compliance

Puck is a **tool-assisted human posting product** — the same legal category as Buffer, Hootsuite, or TweetDeck. X's developer policies (updated October 2025) explicitly permit this.

### What Puck enables (permitted)

* AI-assisted drafting and composition of posts
* Human reviews and approves each post before publishing
* Reading timelines, mentions, DMs for contextual awareness
* Scheduling posts (implemented client-side, not via API)
* Analytics and engagement tracking

### What Puck must not do

* Post autonomously without human approval (bot territory)
* Generate dynamic AI-powered replies without "prior written and explicit approval" from X
* Use X API data to train AI models (explicit ban, exception only for Grok)
* Post duplicate/substantially similar content across multiple accounts
* Manipulate trends, perform bulk automated engagement
* Reward users for posting (banned "InfoFi" pattern)

### Registration guidance

When registering the developer app, describe the use case accurately: "A tool that helps users compose, review, and publish content to X with human approval before each post." X treats the described use case as binding — any substantive deviation may trigger enforcement.

### Content storage rules

* Cached X content must be refreshable via API to reflect current version
* Content removed from X must be removed from Puck's cache within 24 hours
* Display requirements apply when rendering posts: full name, @username, profile picture, timestamp permalink, action icons

## Development Phases

### Phase 1: Core Read/Write

* OAuth 2.0 PKCE authentication with token rotation
* Post CRUD (create, edit, delete, lookup)
* Thread construction
* Image upload (single and batch)
* User timeline and mentions
* Rate limit tracking
* `puck_auth_status` and `puck_rate_status`

### Phase 2: Full Media + Engagement

* Video upload with async processing pipeline
* Animated GIF upload
* Alt text support
* Likes, retweets, bookmarks
* Reply hiding
* Recent search with query operators

### Phase 3: Inbound + Social Graph

* Home timeline
* Direct messages (read + send)
* User lookup and profiles
* Follow/unfollow, mute/unmute
* Lists management

### Phase 4: Streaming + Advanced

* Filtered stream (rules management + connection)
* Trends
* Full-archive search (Pro+ tiers)
* Pay-per-use credit tracking

## Known Gotchas

**Media upload rate limits are shared.** On Free tier, INITIALIZE, APPEND, and FINALIZE all share a 17-request/24hr bucket. A single video upload can consume most of this. Basic tier is dramatically more generous (500/15min).

**Refresh tokens are single-use.** If you refresh and crash before persisting the new token pair, the session is permanently bricked. Atomic file writes are mandatory.

**Reply restrictions.** On non-Enterprise tiers, you can only programmatically reply to a post if the original author @mentions you or quotes your post. This is an API-level restriction, not a policy one.

**Documented rate limits are aspirational.** Developers report hitting limits below documented thresholds, especially on DM endpoints. Always trust response headers over documentation.

**Followers/following is Enterprise-gated.** Despite being listed in v2 docs, these endpoints were removed from Basic and Pro tiers. `puck_follow`/`puck_unfollow` may fail on non-Enterprise accounts.

**Video processing is async with no webhook.** After FINALIZE, you must poll STATUS until processing completes. This can take 30+ seconds for large videos. Puck handles this internally with exponential backoff.

**Edit window is strict.** Posts can only be edited within 30 minutes of creation, with a maximum of 5 edits. After that, the only option is delete and repost.

**Encrypted DMs are invisible.** The API only returns legacy unencrypted DMs. X Chat encrypted messages are not accessible.

## Dependencies

### Required

* `twitter-api-v2` — Community TypeScript client for X API v2. Full type coverage, chunked upload support, pagination helpers, streaming.
* `twitter-text` — Official X library for accurate character counting (URL weighting, emoji sizing, mention handling).
* `@modelcontextprotocol/sdk` — MCP server SDK.

### Evaluated alternatives

* `@xdevplatform/xdk` — Official X TypeScript SDK. Auto-generated from OpenAPI spec, first-party support. Still maturing (announced late 2025). Consider adopting when stable.
* `agent-twitter-client` / `twikit` — Scraping-based libraries. **Not used.** High account suspension risk, TOS violation, brittle.

## API Reference

All endpoints target `https://api.x.com/2/`. OAuth 2.0 endpoints at `https://x.com/i/oauth2/authorize` and `https://api.x.com/2/oauth2/token`. Media upload at `https://api.x.com/2/media/upload` sub-endpoints.

**Key documentation:**

* [X API v2 Introduction](https://docs.x.com/x-api/introduction)
* [Rate Limits](https://docs.x.com/x-api/fundamentals/rate-limits)
* [Pricing](https://docs.x.com/x-api/getting-started/pricing)
* [Fields & Expansions](https://docs.x.com/x-api/fundamentals/fields)
* [Developer Agreement](https://docs.x.com/developer-terms/agreement)
* [Automation Rules](https://help.x.com/en/rules-and-policies/x-automation)

## License

MIT

## References

* [A Midsummer Night's Dream](https://en.wikipedia.org/wiki/A_Midsummer_Night%27s_Dream) — The source of the name
* [MCP Specification](https://modelcontextprotocol.io)
* [X API Documentation](https://docs.x.com)
