import * as fs from "fs";
import * as path from "path";
import { TwitterApi } from "twitter-api-v2";
import { getConfig } from "../auth/oauth2-pkce.js";
import { getValidAccessToken } from "../auth/token-manager.js";
import { checkRateLimit, decrementRemaining, normalizeEndpoint } from "./rate-limiter.js";
import { MediaUploadError, PuckApiError } from "../util/errors.js";
import type { MediaUploadParams, MediaUploadResult } from "../types.js";

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

async function getClient(): Promise<TwitterApi> {
  const config = getConfig();
  const accessToken = await getValidAccessToken(config.clientId);
  return new TwitterApi(accessToken);
}

export async function uploadMedia(params: MediaUploadParams): Promise<MediaUploadResult> {
  const endpoint = normalizeEndpoint("POST", "/2/media/upload");
  checkRateLimit(endpoint);

  const { filePath, altText } = params;

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new MediaUploadError(`File not found: ${filePath}`);
  }

  // Validate file type
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = params.mediaType || ALLOWED_IMAGE_TYPES[ext];
  if (!mimeType) {
    throw new MediaUploadError(
      `Unsupported file type: ${ext}. Phase 1 supports: ${Object.keys(ALLOWED_IMAGE_TYPES).join(", ")}`,
    );
  }

  // Validate file size
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_IMAGE_SIZE) {
    throw new MediaUploadError(
      `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB for images)`,
    );
  }

  const client = await getClient();

  try {
    // twitter-api-v2 handles INIT/APPEND/FINALIZE internally
    const mediaId = await client.v1.uploadMedia(filePath, {
      mimeType,
      target: "tweet",
    });

    decrementRemaining(endpoint);

    // Set alt text if provided
    if (altText) {
      await client.v1.createMediaMetadata(mediaId, {
        alt_text: { text: altText.slice(0, 1000) },
      });
    }

    return {
      mediaId,
      mediaType: mimeType,
      size: stats.size,
      processingStatus: "succeeded",
    };
  } catch (err) {
    throw new MediaUploadError(
      `Media upload failed: ${err instanceof Error ? err.message : err}`,
      err instanceof Error ? { originalError: err.message } : undefined,
    );
  }
}

export async function getMediaStatus(mediaId: string): Promise<{ mediaId: string; status: string; progressPercent?: number }> {
  const client = await getClient();

  try {
    const status = await client.v1.mediaInfo(mediaId);

    return {
      mediaId,
      status: status.processing_info?.state || "succeeded",
      progressPercent: status.processing_info?.progress_percent,
    };
  } catch (err) {
    throw new PuckApiError("api_error", `Failed to get media status: ${err instanceof Error ? err.message : err}`);
  }
}
