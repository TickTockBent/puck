import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { saveTokens, loadTokens, clearTokens } from "../../../src/auth/storage.js";
import type { TokenData } from "../../../src/types.js";

const testDir = path.join(os.tmpdir(), `puck-test-${process.pid}`);
const testTokenPath = path.join(testDir, "tokens.json");

describe("token storage", () => {
  beforeEach(() => {
    process.env.PUCK_TOKEN_PATH = testTokenPath;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    delete process.env.PUCK_TOKEN_PATH;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  const sampleTokens: TokenData = {
    access_token: "test-access-token-12345",
    refresh_token: "test-refresh-token-67890",
    expires_at: Date.now() + 7200 * 1000,
    token_type: "Bearer",
    scope: "tweet.read tweet.write users.read",
  };

  it("saves and loads tokens with encryption roundtrip", () => {
    saveTokens(sampleTokens);
    const loaded = loadTokens();

    expect(loaded).not.toBeNull();
    expect(loaded!.access_token).toBe(sampleTokens.access_token);
    expect(loaded!.refresh_token).toBe(sampleTokens.refresh_token);
    expect(loaded!.expires_at).toBe(sampleTokens.expires_at);
    expect(loaded!.token_type).toBe(sampleTokens.token_type);
    expect(loaded!.scope).toBe(sampleTokens.scope);
  });

  it("stores tokens encrypted on disk", () => {
    saveTokens(sampleTokens);
    const rawContent = fs.readFileSync(testTokenPath, "utf8");

    // Should not contain plaintext tokens
    expect(rawContent).not.toContain(sampleTokens.access_token);
    expect(rawContent).not.toContain(sampleTokens.refresh_token);

    // Should be in iv:encrypted format
    expect(rawContent).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
  });

  it("returns null when no tokens exist", () => {
    const loaded = loadTokens();
    expect(loaded).toBeNull();
  });

  it("clears tokens", () => {
    saveTokens(sampleTokens);
    expect(loadTokens()).not.toBeNull();

    clearTokens();
    expect(loadTokens()).toBeNull();
  });

  it("creates directory with 0o700 permissions", () => {
    saveTokens(sampleTokens);
    const stats = fs.statSync(testDir);
    expect(stats.mode & 0o777).toBe(0o700);
  });

  it("writes file with 0o600 permissions", () => {
    saveTokens(sampleTokens);
    const stats = fs.statSync(testTokenPath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("uses atomic write (no temp files left behind)", () => {
    saveTokens(sampleTokens);
    const files = fs.readdirSync(testDir);
    // Only the token file should exist, no .tmp files
    expect(files).toEqual(["tokens.json"]);
  });

  it("overwrites existing tokens atomically", () => {
    saveTokens(sampleTokens);
    const updatedTokens: TokenData = {
      ...sampleTokens,
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
    };
    saveTokens(updatedTokens);

    const loaded = loadTokens();
    expect(loaded!.access_token).toBe("new-access-token");
    expect(loaded!.refresh_token).toBe("new-refresh-token");
  });
});
