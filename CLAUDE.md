# Puck

X/Twitter MCP server wrapping v2 API. Sibling to [Moist](../Moist/) (Gmail MCP) — follow its conventions.

## Build & Test
- `npm run build` — TypeScript compile
- `npm test` — vitest, 85 tests, zero API calls
- `PUCK_CLIENT_ID=test node dist/index.js` — smoke test startup

## twitter-api-v2 Type Gotchas
- Paginator methods (`.userTimeline()`, `.search()`) return objects with `.tweets`, `.includes`, `.meta`, `.rateLimit`
- Non-paginator methods (`.tweet()`, `.deleteTweet()`, `.singleTweet()`) return plain typed results — no `.rateLimit`
- No native edit support — use raw `client.v2.post("tweets", body)` with `edit_options`
- `TweetPublicMetricsV2` needs `as unknown as Record<string, number>` for impression/bookmark counts

## Other Gotchas
- `twitter-text` has no @types — custom declaration at `src/twitter-text.d.ts`
- `parseTweet("")` returns `valid: false` — this is correct behavior, not a bug
- `normalizeEndpoint()` uses `\d{3,}` regex to avoid replacing `/2/` API version prefix
- Refresh tokens are single-use — token persistence MUST be atomic (temp file + rename)

## Testing
- Mock `twitter-api-v2` at library level with `vi.mock("twitter-api-v2")` — see `tests/unit/client/x-api.test.ts`
- Auth modules mocked separately: `vi.mock("../auth/oauth2-pkce.js")`, `vi.mock("../auth/token-manager.js")`
- Storage tests use `PUCK_TOKEN_PATH` env var pointing to tmp dir
