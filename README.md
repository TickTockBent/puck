# Puck

**X/Twitter MCP Connector**

*"Lord, what fools these mortals be!"*

---

Puck is an [MCP](https://modelcontextprotocol.io) server that exposes the X (Twitter) API v2 as tools. It handles OAuth 2.0 PKCE with automatic token rotation, rate limit tracking, image uploads, and thread construction so consuming applications don't have to.

Named for the mischievous sprite from Shakespeare's *A Midsummer Night's Dream* — quick, everywhere at once, short utterances that cause outsized reactions.

## Quick Start

### 1. X Developer Setup

1. Create a project at [developer.x.com](https://developer.x.com)
2. Select **Basic** tier ($200/mo) or higher — Free tier is insufficient for meaningful use
3. Create an **OAuth 2.0 App** with Type: "Web App" (for PKCE flow)
4. Add `http://localhost:3000/oauth/callback` as a redirect URI
5. Note your Client ID (public) — no client secret needed for PKCE

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
|----------|----------|-------------|
| `PUCK_CLIENT_ID` | Yes | X OAuth 2.0 Client ID |
| `PUCK_REDIRECT_URI` | No | OAuth callback URI (default: `http://localhost:3000/oauth/callback`) |
| `PUCK_TOKEN_PATH` | No | Token storage location (default: `~/.puck/tokens.json`) |
| `PUCK_API_TIER` | No | API tier: `free`, `basic`, `pro`, `enterprise` (default: `basic`) |
| `PUCK_LOG_LEVEL` | No | Logging level (default: `info`) |

## Tools

### Authentication

| Tool | Description |
|------|-------------|
| `puck_auth_status` | Check authentication state, username, scopes, token expiry, and API tier |
| `puck_auth_logout` | Revoke tokens and clear stored credentials |
| `puck_rate_status` | Show current rate limit state across all tracked endpoint groups |

### Posts

| Tool | Description |
|------|-------------|
| `puck_post_create` | Create a post (supports text, polls, reply settings, quote tweets, media) |
| `puck_post_edit` | Edit a post within the 30-minute / 5-edit window |
| `puck_post_delete` | Delete a post |
| `puck_post_get` | Get a post by ID with full field expansion |
| `puck_post_lookup` | Batch lookup posts by IDs (up to 100) |

### Threads

| Tool | Description |
|------|-------------|
| `puck_thread_create` | Create a thread from an array of post objects (handles chained reply IDs automatically) |
| `puck_thread_get` | Get all posts in a thread by conversation ID |

### Media

| Tool | Description |
|------|-------------|
| `puck_media_upload` | Upload images (JPG, PNG, WebP, up to 4 files, max 5MB each) with optional alt text |
| `puck_media_status` | Check processing status of an uploaded media item |

### Timelines

| Tool | Description |
|------|-------------|
| `puck_timeline_user` | Get a user's posts by user ID or @username |
| `puck_timeline_mentions` | Get the authenticated user's mentions |

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio transport)
├── types.ts              # TypeScript interfaces and X API types
├── auth/
│   ├── oauth2-pkce.ts    # OAuth 2.0 PKCE flow, browser consent, token exchange
│   ├── token-manager.ts  # Proactive refresh, rotation handling, deduplication
│   └── storage.ts        # Encrypted token storage (~/.puck/)
├── client/
│   ├── x-api.ts          # X API v2 client wrapper (all calls route through here)
│   ├── rate-limiter.ts   # Per-endpoint rate limit tracking from response headers
│   ├── media.ts          # Image upload pipeline
│   └── fields.ts         # Field/expansion constants for v2 response shaping
├── tools/
│   ├── auth.ts           # Auth status, logout, rate status tools
│   ├── posts.ts          # Post CRUD and thread construction
│   ├── media.ts          # Media upload tools
│   └── timelines.ts      # Timeline and mentions tools
└── util/
    ├── character-count.ts # Accurate post length calculation (URLs=23, emoji=2)
    ├── pagination.ts      # Pagination helper
    └── errors.ts          # Typed error classes and normalizer
```

### Key Design Decisions

- **Stateless** — No caching of API responses. Each tool call hits the X API directly. Rate limit state is the sole exception.
- **Single account** — One X account per server instance. Run multiple instances for multiple accounts.
- **V2 only** — No v1.1 endpoints. The entire API surface uses `api.x.com/2/`.
- **Response-header rate limiting** — Rate limits are tracked from `x-rate-limit-*` response headers. No pre-seeding, no guessing. Only blocks when headers confirm the window is exhausted.
- **Proactive token refresh** — Access tokens expire every 2 hours. Puck refreshes when <15 minutes remain rather than waiting for a 401.
- **Atomic token persistence** — Refresh tokens are single-use with rotation. Puck writes to a temp file then `fs.renameSync()` to prevent the "lost refresh token" failure mode.
- **Thread partial failure recovery** — If a thread fails mid-creation, the successfully posted portion is returned with failure metadata.
- **Encrypted storage** — Tokens at rest are AES-256-CBC encrypted using a machine-specific derived key.

### Error Handling

All tools return consistent error shapes:

```json
{
  "error": "rate_limited",
  "message": "POST /2/tweets rate limit reached (100/window). Resets at 2026-02-25T15:30:00Z.",
  "retryAfter": 340,
  "endpoint": "POST /2/tweets"
}
```

| Error Code | Meaning |
|------------|---------|
| `not_found` | Post or user doesn't exist |
| `rate_limited` | Endpoint rate limit hit (includes `retryAfter`) |
| `auth_failed` | Token expired/revoked and refresh failed |
| `auth_required` | Not authenticated |
| `forbidden` | Insufficient permissions or tier |
| `invalid_request` | Bad parameters |
| `content_too_long` | Post exceeds 280 characters |
| `media_failed` | Media upload or processing failed |
| `api_error` | X API error (details included) |

## OAuth Scopes (Phase 1)

| Scope | Purpose |
|-------|---------|
| `tweet.read` | Read posts and timelines |
| `tweet.write` | Create and delete posts |
| `users.read` | User profiles (required by most endpoints) |
| `media.write` | Upload media |
| `offline.access` | Receive refresh tokens |

Future phases will request additional scopes as features are added.

## Testing Without API Access

X does not offer a sandbox environment for the core API. Here are your options for testing:

**Unit tests (no API needed):**
```bash
npm test
```
All 57 unit tests run against mocked data with zero API calls.

**Mock server (no API needed):**
[Mockoon](https://mockoon.com/mock-samples/twittercom-current/) provides a pre-built X API v2 mock that runs locally. Point `twitter-api-v2` at `http://localhost:your-port` for integration testing without credentials.

**Free tier (limited, may be discontinued):**
The Free tier ($0) allows OAuth authentication, `POST /2/tweets` (create), and `DELETE /2/tweets/:id` (delete) — but no read endpoints. You can verify the OAuth flow works and that posts are created/deleted. As of February 2026, X is transitioning to pay-per-use and the free tier may no longer be available.

**VCR/cassette recording (one-time API access):**
Record real API responses once, replay them in tests forever. This is the approach used by Tweepy and other major Twitter libraries. If you have even temporary API access, this is the gold standard.

**Recommended approach:** Use unit tests + Mockoon for development. Do a single manual smoke test with real credentials before shipping.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Manual smoke test (requires real X API credentials)
PUCK_CLIENT_ID=your_id node dist/index.js
```

## Development Phases

| Phase | Status | Scope |
|-------|--------|-------|
| 1 | **Done** | OAuth, post CRUD, threads, image upload, timelines, rate limiting |
| 2 | Planned | Video/GIF upload, engagement (likes, retweets, bookmarks), search |
| 3 | Planned | Home timeline, DMs, user lookup, follow/mute |
| 4 | Planned | Filtered streaming, trends, full-archive search |

## License

MIT

## References

- [A Midsummer Night's Dream](https://en.wikipedia.org/wiki/A_Midsummer_Night%27s_Dream) — The source of the name
- [MCP Specification](https://modelcontextprotocol.io)
- [X API Documentation](https://docs.x.com)
- [X API Rate Limits](https://docs.x.com/x-api/fundamentals/rate-limits)
