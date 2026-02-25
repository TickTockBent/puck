#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticate } from "./auth/oauth2-pkce.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerPostTools } from "./tools/posts.js";
import { registerMediaTools } from "./tools/media.js";
import { registerTimelineTools } from "./tools/timelines.js";

async function main(): Promise<void> {
  console.error("[puck] Starting Puck — X/Twitter MCP Connector");

  const server = new McpServer({
    name: "puck",
    version: "1.0.0",
  });

  // Register all tools before connecting
  registerAuthTools(server);
  registerPostTools(server);
  registerMediaTools(server);
  registerTimelineTools(server);

  // Attempt authentication (loads saved tokens or starts OAuth flow)
  try {
    await authenticate();
  } catch (err) {
    console.error(
      `[puck] Authentication failed: ${err instanceof Error ? err.message : err}`,
    );
    console.error(
      "[puck] Server will start but tools requiring auth will fail. Use puck_auth_status to check.",
    );
  }

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[puck] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[puck] Fatal error:", err);
  process.exit(1);
});
