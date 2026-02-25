import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock twitter-api-v2
vi.mock("twitter-api-v2", () => {
  const mockV1 = {
    uploadMedia: vi.fn(),
    createMediaMetadata: vi.fn(),
    mediaInfo: vi.fn(),
  };

  class MockTwitterApi {
    v1 = mockV1;
    v2 = {};
    constructor() {}
    static mockV1 = mockV1;
  }

  return { TwitterApi: MockTwitterApi };
});

vi.mock("../../../src/auth/oauth2-pkce.js", () => ({
  getConfig: () => ({
    clientId: "test-client-id",
    redirectUri: "http://localhost:3000/oauth/callback",
    tokenPath: "",
    apiTier: "basic" as const,
    logLevel: "info",
  }),
}));

vi.mock("../../../src/auth/token-manager.js", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
}));

import { TwitterApi } from "twitter-api-v2";
import { uploadMedia, getMediaStatus } from "../../../src/client/media.js";
import { clearRateLimits } from "../../../src/client/rate-limiter.js";

const mockV1 = (TwitterApi as unknown as { mockV1: Record<string, ReturnType<typeof vi.fn>> }).mockV1;

describe("media client", () => {
  const testDir = path.join(os.tmpdir(), `puck-media-test-${process.pid}`);
  const testImagePath = path.join(testDir, "test.jpg");

  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();

    // Create a fake image file for testing
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(testImagePath, Buffer.alloc(1024)); // 1KB fake image
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe("uploadMedia", () => {
    it("uploads an image and returns media ID", async () => {
      mockV1.uploadMedia.mockResolvedValue("media-id-123");

      const result = await uploadMedia({ filePath: testImagePath });

      expect(result.mediaId).toBe("media-id-123");
      expect(result.mediaType).toBe("image/jpeg");
      expect(result.processingStatus).toBe("succeeded");
      expect(mockV1.uploadMedia).toHaveBeenCalledWith(testImagePath, {
        mimeType: "image/jpeg",
        target: "tweet",
      });
    });

    it("sets alt text when provided", async () => {
      mockV1.uploadMedia.mockResolvedValue("media-id-456");

      await uploadMedia({ filePath: testImagePath, altText: "A test image" });

      expect(mockV1.createMediaMetadata).toHaveBeenCalledWith("media-id-456", {
        alt_text: { text: "A test image" },
      });
    });

    it("truncates alt text to 1000 characters", async () => {
      mockV1.uploadMedia.mockResolvedValue("media-id-789");
      const longAltText = "a".repeat(1500);

      await uploadMedia({ filePath: testImagePath, altText: longAltText });

      expect(mockV1.createMediaMetadata).toHaveBeenCalledWith("media-id-789", {
        alt_text: { text: "a".repeat(1000) },
      });
    });

    it("rejects non-existent files", async () => {
      await expect(uploadMedia({ filePath: "/nonexistent/file.jpg" })).rejects.toThrow("File not found");
    });

    it("rejects unsupported file types", async () => {
      const gifPath = path.join(testDir, "test.gif");
      fs.writeFileSync(gifPath, Buffer.alloc(100));

      await expect(uploadMedia({ filePath: gifPath })).rejects.toThrow("Unsupported file type");
    });

    it("rejects files over 5MB", async () => {
      const largePath = path.join(testDir, "large.jpg");
      fs.writeFileSync(largePath, Buffer.alloc(6 * 1024 * 1024)); // 6MB

      await expect(uploadMedia({ filePath: largePath })).rejects.toThrow("File too large");
    });

    it("supports PNG files", async () => {
      const pngPath = path.join(testDir, "test.png");
      fs.writeFileSync(pngPath, Buffer.alloc(100));
      mockV1.uploadMedia.mockResolvedValue("png-media-id");

      const result = await uploadMedia({ filePath: pngPath });

      expect(result.mediaType).toBe("image/png");
    });

    it("supports WebP files", async () => {
      const webpPath = path.join(testDir, "test.webp");
      fs.writeFileSync(webpPath, Buffer.alloc(100));
      mockV1.uploadMedia.mockResolvedValue("webp-media-id");

      const result = await uploadMedia({ filePath: webpPath });

      expect(result.mediaType).toBe("image/webp");
    });
  });

  describe("getMediaStatus", () => {
    it("returns processing status", async () => {
      mockV1.mediaInfo.mockResolvedValue({
        processing_info: { state: "in_progress", progress_percent: 50 },
      });

      const result = await getMediaStatus("media-123");

      expect(result.mediaId).toBe("media-123");
      expect(result.status).toBe("in_progress");
      expect(result.progressPercent).toBe(50);
    });

    it("returns succeeded when no processing_info", async () => {
      mockV1.mediaInfo.mockResolvedValue({});

      const result = await getMediaStatus("media-456");

      expect(result.status).toBe("succeeded");
    });
  });
});
