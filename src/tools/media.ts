import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { uploadMedia, getMediaStatus } from "../client/media.js";
import { toPuckError } from "../util/errors.js";
import type { MediaUploadResult } from "../types.js";

export function registerMediaTools(server: McpServer): void {
  server.tool(
    "puck_media_upload",
    "Upload images for attachment to posts. Accepts up to 4 file paths with optional alt text. Phase 1 supports JPG, PNG, WebP (max 5MB each).",
    {
      files: z.array(z.object({
        filePath: z.string().describe("Absolute path to the image file"),
        altText: z.string().optional().describe("Alt text for accessibility (max 1000 chars)"),
      })).min(1).max(4).describe("Array of files to upload"),
    },
    async (params) => {
      const results: MediaUploadResult[] = [];

      for (const file of params.files) {
        try {
          const result = await uploadMedia({
            filePath: file.filePath,
            altText: file.altText,
          });
          results.push(result);
        } catch (err) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                uploaded: results,
                error: toPuckError(err),
                failedFile: file.filePath,
              }, null, 2),
            }],
          };
        }
      }

      return { content: [{ type: "text", text: JSON.stringify({ uploaded: results }, null, 2) }] };
    },
  );

  server.tool(
    "puck_media_status",
    "Check processing status of an uploaded media item",
    {
      mediaId: z.string().describe("The media ID to check"),
    },
    async (params) => {
      try {
        const result = await getMediaStatus(params.mediaId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify(toPuckError(err)) }] };
      }
    },
  );
}
