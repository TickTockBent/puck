import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAuthStatus, logout } from "../auth/oauth2-pkce.js";
import { getRateLimitStatus } from "../client/rate-limiter.js";

export function registerAuthTools(server: McpServer): void {
  server.tool(
    "puck_auth_status",
    "Check authentication state, username, scopes, token expiry, and API tier",
    {},
    async () => {
      const result = await getAuthStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "puck_auth_logout",
    "Revoke tokens and clear stored credentials",
    {},
    async () => {
      const result = await logout();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "puck_rate_status",
    "Show current rate limit state across all tracked endpoint groups",
    {},
    async () => {
      const status = getRateLimitStatus();
      const endpoints = Object.keys(status);
      if (endpoints.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ message: "No rate limit data tracked yet. Data is populated from API response headers." }) }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    },
  );
}
