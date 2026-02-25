import * as http from "http";
import { TwitterApi } from "twitter-api-v2";
import { saveTokens, loadTokens, clearTokens } from "./storage.js";
import { refreshTokensSafe } from "./token-manager.js";
import type { PuckConfig, ApiTier, AuthStatus, TokenData } from "../types.js";

const DEFAULT_PORT = 3000;
const DEFAULT_REDIRECT_URI = `http://localhost:${DEFAULT_PORT}/oauth/callback`;

const PHASE1_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "media.write",
  "offline.access",
];

let authenticatedUserId: string | null = null;
let authenticatedUsername: string | null = null;

export function getConfig(): PuckConfig {
  const clientId = process.env.PUCK_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "PUCK_CLIENT_ID environment variable is required. " +
        "Create an X Developer project with OAuth 2.0 PKCE and set the Client ID.",
    );
  }

  const redirectUri = process.env.PUCK_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  const tokenPath = process.env.PUCK_TOKEN_PATH || "";
  const apiTier = (process.env.PUCK_API_TIER || "basic") as ApiTier;
  const logLevel = process.env.PUCK_LOG_LEVEL || "info";

  return { clientId, redirectUri, tokenPath, apiTier, logLevel };
}

function getPort(): number {
  const config = getConfig();
  try {
    const url = new URL(config.redirectUri);
    return parseInt(url.port, 10) || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function getCallbackPath(): string {
  const config = getConfig();
  try {
    const url = new URL(config.redirectUri);
    return url.pathname;
  } catch {
    return "/oauth/callback";
  }
}

async function verifyTokens(accessToken: string): Promise<boolean> {
  try {
    const client = new TwitterApi(accessToken);
    const me = await client.v2.me();
    authenticatedUserId = me.data.id;
    authenticatedUsername = me.data.username;
    console.error(`[puck] Authenticated as @${authenticatedUsername}`);
    return true;
  } catch {
    return false;
  }
}

function waitForAuthCode(
  port: number,
  callbackPath: string,
  expectedState: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);

      if (url.pathname === callbackPath) {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Authorization Failed</h1>" +
              `<p>Error: ${error}</p>` +
              "<p>You can close this window.</p></body></html>",
          );
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Authorization Failed</h1>" +
              "<p>State mismatch — possible CSRF attack.</p>" +
              "<p>You can close this window.</p></body></html>",
          );
          server.close();
          reject(new Error("OAuth state mismatch — possible CSRF attack"));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body>" +
              "<h1>Puck — Authorization Successful</h1>" +
              "<p>You can close this window and return to your application.</p>" +
              "</body></html>",
          );
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(port, "localhost", () => {
      console.error(
        `[puck] OAuth callback server listening on http://localhost:${port}${callbackPath}`,
      );
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out after 2 minutes"));
    }, 120_000);

    server.on("close", () => clearTimeout(timeout));
  });
}

export async function authenticate(): Promise<void> {
  const config = getConfig();

  // Try to load existing tokens
  const existingTokens = loadTokens();
  if (existingTokens) {
    // Check if token needs refresh (< 15 min remaining)
    const now = Date.now();
    const expiresAt = existingTokens.expires_at;

    if (expiresAt > now + 15 * 60 * 1000) {
      // Token still has > 15 min, verify it works
      if (await verifyTokens(existingTokens.access_token)) {
        return;
      }
    }

    // Try refresh
    if (existingTokens.refresh_token) {
      try {
        const newTokens = await refreshTokensSafe(
          config.clientId,
          existingTokens.refresh_token,
        );
        if (await verifyTokens(newTokens.access_token)) {
          return;
        }
      } catch {
        console.error("[puck] Token refresh failed, starting OAuth flow...");
      }
    }
  }

  // Full browser OAuth flow
  const port = getPort();
  const callbackPath = getCallbackPath();

  const twitterClient = new TwitterApi({ clientId: config.clientId });
  const { url: authUrl, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    config.redirectUri,
    { scope: PHASE1_SCOPES },
  );

  console.error("[puck] Opening browser for authorization...");
  console.error(`[puck] If browser doesn't open, visit: ${authUrl}`);

  const codePromise = waitForAuthCode(port, callbackPath, state);

  try {
    const openModule = await import("open");
    await openModule.default(authUrl);
  } catch {
    console.error("[puck] Could not open browser automatically. Please visit the URL above.");
  }

  const code = await codePromise;

  const { accessToken, refreshToken, expiresIn } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: config.redirectUri,
  });

  const tokenData: TokenData = {
    access_token: accessToken,
    refresh_token: refreshToken || "",
    expires_at: Date.now() + (expiresIn ?? 7200) * 1000,
    token_type: "Bearer",
    scope: PHASE1_SCOPES.join(" "),
  };
  saveTokens(tokenData);

  await verifyTokens(accessToken);
}

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    const config = getConfig();
    const tokens = loadTokens();

    if (!tokens) {
      return { authenticated: false, error: "Not authenticated" };
    }

    return {
      authenticated: true,
      username: authenticatedUsername || undefined,
      userId: authenticatedUserId || undefined,
      scopes: tokens.scope?.split(" "),
      expiresAt: tokens.expires_at
        ? new Date(tokens.expires_at).toISOString()
        : undefined,
      apiTier: config.apiTier,
    };
  } catch (err) {
    return {
      authenticated: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function logout(): Promise<{ success: boolean }> {
  try {
    const config = getConfig();
    const tokens = loadTokens();

    if (tokens?.access_token) {
      try {
        const client = new TwitterApi(tokens.access_token);
        await client.revokeOAuth2Token(tokens.access_token, "access_token");
      } catch {
        // Token may already be invalid
      }
    }

    clearTokens();
    authenticatedUserId = null;
    authenticatedUsername = null;
    return { success: true };
  } catch {
    clearTokens();
    authenticatedUserId = null;
    authenticatedUsername = null;
    return { success: true };
  }
}

export function getAuthenticatedUserId(): string | null {
  return authenticatedUserId;
}

export function getAuthenticatedUsername(): string | null {
  return authenticatedUsername;
}
