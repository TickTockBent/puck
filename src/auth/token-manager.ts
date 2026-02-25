import { TwitterApi } from "twitter-api-v2";
import { saveTokens, loadTokens } from "./storage.js";
import type { TokenData } from "../types.js";
import { AuthRequiredError } from "../util/errors.js";

const REFRESH_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// Deduplication: if a refresh is already in flight, reuse the same promise
let pendingRefresh: Promise<TokenData> | null = null;

export async function getValidAccessToken(clientId: string): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new AuthRequiredError();
  }

  const now = Date.now();
  const timeUntilExpiry = tokens.expires_at - now;

  if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
    return tokens.access_token;
  }

  // Token is expired or expiring soon — refresh
  if (!tokens.refresh_token) {
    throw new AuthRequiredError("Token expired and no refresh token available. Please re-authenticate.");
  }

  const refreshed = await refreshTokensSafe(clientId, tokens.refresh_token);
  return refreshed.access_token;
}

export async function refreshTokensSafe(
  clientId: string,
  refreshToken: string,
): Promise<TokenData> {
  // Deduplicate concurrent refresh attempts
  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = performRefresh(clientId, refreshToken).finally(() => {
    pendingRefresh = null;
  });

  return pendingRefresh;
}

async function performRefresh(
  clientId: string,
  refreshToken: string,
): Promise<TokenData> {
  const client = new TwitterApi({ clientId });

  const {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn,
  } = await client.refreshOAuth2Token(refreshToken);

  const tokenData: TokenData = {
    access_token: newAccessToken,
    refresh_token: newRefreshToken || "",
    expires_at: Date.now() + (expiresIn ?? 7200) * 1000,
    token_type: "Bearer",
    scope: loadTokens()?.scope || "",
  };

  // Persist atomically BEFORE using the new token
  saveTokens(tokenData);

  console.error("[puck] Token refreshed successfully");
  return tokenData;
}

export async function revokeTokens(clientId: string): Promise<void> {
  const tokens = loadTokens();
  if (!tokens) return;

  try {
    if (tokens.access_token) {
      const client = new TwitterApi(tokens.access_token);
      await client.revokeOAuth2Token(tokens.access_token, "access_token");
    }
  } catch {
    // Token may already be invalid
  }
}
