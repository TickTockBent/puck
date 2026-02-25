import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createPost, editPost, deletePost, getPost, lookupPosts, searchByConversation } from "../client/x-api.js";
import { validatePostText } from "../util/character-count.js";
import { toPuckError, PuckApiError, ThreadPartialError } from "../util/errors.js";
import type { PostData, ThreadCreateResult } from "../types.js";

export function registerPostTools(server: McpServer): void {
  server.tool(
    "puck_post_create",
    "Create a post (tweet). Supports text, reply, quote, media attachments, polls, and reply settings.",
    {
      text: z.string().describe("The post text (max 280 characters)"),
      replyToPostId: z.string().optional().describe("Post ID to reply to"),
      quotePostId: z.string().optional().describe("Post ID to quote"),
      mediaIds: z.array(z.string()).optional().describe("Media IDs to attach (up to 4 images)"),
      replySettings: z.enum(["following", "mentionedUsers"]).optional().describe("Who can reply"),
      pollOptions: z.array(z.string()).optional().describe("Poll options (2-4 choices)"),
      pollDurationMinutes: z.number().optional().describe("Poll duration in minutes (5-10080)"),
    },
    async (params) => {
      const validation = validatePostText(params.text);
      if (!validation.valid) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "content_too_long", message: validation.error }) }] };
      }

      try {
        const result = await createPost({
          text: params.text,
          replyToPostId: params.replyToPostId,
          quotePostId: params.quotePostId,
          mediaIds: params.mediaIds,
          replySettings: params.replySettings,
          poll: params.pollOptions && params.pollDurationMinutes
            ? { options: params.pollOptions, durationMinutes: params.pollDurationMinutes }
            : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_post_edit",
    "Edit a post within the 30-minute / 5-edit window. Uses POST /2/tweets with edit_options.previous_tweet_id.",
    {
      previousPostId: z.string().describe("The ID of the post to edit"),
      text: z.string().describe("The new post text (max 280 characters)"),
      mediaIds: z.array(z.string()).optional().describe("Updated media IDs to attach"),
    },
    async (params) => {
      const validation = validatePostText(params.text);
      if (!validation.valid) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "content_too_long", message: validation.error }) }] };
      }

      try {
        const result = await editPost(params.previousPostId, {
          text: params.text,
          mediaIds: params.mediaIds,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_post_delete",
    "Delete a post by ID",
    {
      postId: z.string().describe("The post ID to delete"),
    },
    async (params) => {
      try {
        const result = await deletePost(params.postId);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_post_get",
    "Get a post by ID with full field expansion",
    {
      postId: z.string().describe("The post ID to retrieve"),
    },
    async (params) => {
      try {
        const result = await getPost(params.postId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_post_lookup",
    "Batch lookup posts by IDs (up to 100)",
    {
      postIds: z.array(z.string()).min(1).max(100).describe("Array of post IDs to look up"),
    },
    async (params) => {
      try {
        const result = await lookupPosts(params.postIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_thread_create",
    "Create a thread from an array of post texts. Handles chained reply IDs automatically with partial failure recovery.",
    {
      posts: z.array(z.object({
        text: z.string().describe("Post text"),
        mediaIds: z.array(z.string()).optional().describe("Media IDs to attach"),
      })).min(2).max(25).describe("Array of posts in thread order"),
      replySettings: z.enum(["following", "mentionedUsers"]).optional().describe("Who can reply to thread posts"),
    },
    async (params) => {
      // Validate all posts first
      for (let i = 0; i < params.posts.length; i++) {
        const validation = validatePostText(params.posts[i].text);
        if (!validation.valid) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "content_too_long",
                message: `Post ${i + 1}: ${validation.error}`,
              }),
            }],
          };
        }
      }

      const postedPosts: PostData[] = [];
      let previousPostId: string | undefined;

      try {
        for (let i = 0; i < params.posts.length; i++) {
          const post = params.posts[i];

          try {
            const result = await createPost({
              text: post.text,
              replyToPostId: previousPostId,
              mediaIds: post.mediaIds,
              replySettings: i === 0 ? params.replySettings : undefined,
            });

            postedPosts.push(result.post);
            previousPostId = result.post.id;
          } catch (err) {
            // Partial failure — return what was posted successfully
            const threadResult: ThreadCreateResult = {
              threadId: postedPosts.length > 0 ? postedPosts[0].conversationId || postedPosts[0].id : "",
              posts: postedPosts,
              partialFailure: {
                failedAtIndex: i,
                error: toPuckError(err),
              },
            };
            return { content: [{ type: "text", text: JSON.stringify(threadResult, null, 2) }] };
          }
        }

        const threadResult: ThreadCreateResult = {
          threadId: postedPosts[0].conversationId || postedPosts[0].id,
          posts: postedPosts,
        };
        return { content: [{ type: "text", text: JSON.stringify(threadResult, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );

  server.tool(
    "puck_thread_get",
    "Get all posts in a thread by conversation ID (requires Basic+ tier)",
    {
      conversationId: z.string().describe("The conversation ID of the thread"),
      maxResults: z.number().optional().describe("Maximum number of posts to return (default 100)"),
    },
    async (params) => {
      try {
        const result = await searchByConversation(params.conversationId, params.maxResults);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );
}
