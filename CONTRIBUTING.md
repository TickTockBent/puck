# Contributing to Puck

Thanks for your interest in contributing to Puck.

## Development Setup

```bash
git clone https://github.com/ticktockbent/puck.git
cd puck
npm install
npm run build
```

## Running Tests

```bash
# Run all unit tests
npm test

# Watch mode
npx vitest
```

Unit tests use mocked data and do not require X API credentials.

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── types.ts              # Shared TypeScript interfaces
├── auth/                 # OAuth 2.0 PKCE, token management, encrypted storage
├── client/               # X API wrapper, rate limiter, media upload, field constants
├── tools/                # MCP tool registrations (auth, posts, media, timelines)
└── util/                 # Character counting, error classes, pagination helpers
tests/
└── unit/                 # Unit tests mirroring src/ structure
```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Ensure `npm run build` compiles without errors
4. Ensure `npm test` passes
5. Open a pull request

## Code Style

- TypeScript strict mode
- Descriptive variable names
- No unnecessary abstractions — keep it simple
- Error classes in `src/util/errors.ts`, types in `src/types.ts`
- Follow existing patterns (look at how Moist does it if unsure)

## Testing Against the Real API

Unit tests should not hit the real X API. If you need to verify real API behavior:

- The Free tier allows basic OAuth + post create/delete (but no reads)
- See the README's "Testing Without API Access" section for mock approaches
- Integration test recordings (VCR/cassette style) are welcome as contributions

## Phases

Puck is built in phases. Phase 1 (core read/write) is complete. If you want to work on future phases, open an issue first to discuss the approach.

| Phase | Scope |
|-------|-------|
| 1 (done) | OAuth, post CRUD, threads, image upload, timelines, rate limiting |
| 2 | Video/GIF upload, engagement (likes, retweets, bookmarks), search |
| 3 | Home timeline, DMs, user lookup, follow/mute |
| 4 | Filtered streaming, trends, full-archive search |

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
