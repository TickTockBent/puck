import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUserTimeline, getUserMentions } from "../client/x-api.js";
import { toPuckError } from "../util/errors.js";

export function registerTimelineTools(server: McpServer): void {
  server.tool(
    "puck_timeline_user",
    "Get a user's posts by user ID or @username",
    {
      userId: z.string().optional().describe("User ID (provide either userId or username)"),
      username: z.string().optional().describe("Username without @ (provide either userId or username)"),
      maxResults: z.number().optional().describe("Number of posts to return (default 10, max 100)"),
      paginationToken: z.string().optional().describe("Pagination token for next page"),
    },
    async (params) => {
      if (!params.userId && !params.username) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "invalid_request", message: "Either userId or username is required" }) }],
        };
      }

      try {
        const result = await getUserTimeline({
          userId: params.userId,
          username: params.username,
          maxResults: params.maxResults,
          paginationToken: params.paginationToken,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_timeline_mentions",
    "Get the authenticated user's mentions",
    {
      maxResults: z.number().optional().describe("Number of mentions to return (default 10, max 100)"),
      paginationToken: z.string().optional().describe("Pagination token for next page"),
    },
    async (params) => {
      try {
        const result = await getUserMentions({
          maxResults: params.maxResults,
          paginationToken: params.paginationToken,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );
}
