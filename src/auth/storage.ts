import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import type { TokenData } from "../types.js";

function getTokenDir(): string {
  const tokenPath = process.env.PUCK_TOKEN_PATH;
  if (tokenPath) {
    return path.dirname(tokenPath);
  }
  return path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".puck",
  );
}

function getTokenPath(): string {
  return process.env.PUCK_TOKEN_PATH || path.join(getTokenDir(), "tokens.json");
}

function getDerivedKey(): Buffer {
  const material = `puck-${process.env.USER || process.env.USERNAME || "default"}-${os.hostname()}`;
  return crypto.scryptSync(material, "puck-salt", 32);
}

function encrypt(data: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(data: string): string {
  const key = getDerivedKey();
  const [ivHex, encrypted] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function ensurePuckDir(): void {
  const dir = getTokenDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function saveTokens(tokens: TokenData): void {
  ensurePuckDir();
  const tokensPath = getTokenPath();
  const encrypted = encrypt(JSON.stringify(tokens));

  // Atomic write: write to temp file then rename
  // Both files in same directory guarantees same filesystem for rename
  const tempPath = `${tokensPath}.tmp.${process.pid}`;
  fs.writeFileSync(tempPath, encrypted, { mode: 0o600 });
  fs.renameSync(tempPath, tokensPath);
}

export function loadTokens(): TokenData | null {
  const tokensPath = getTokenPath();
  if (!fs.existsSync(tokensPath)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(tokensPath, "utf8");
    const decrypted = decrypt(encrypted);
    return JSON.parse(decrypted) as TokenData;
  } catch {
    console.error("[puck] Failed to load tokens, may need to re-authenticate");
    return null;
  }
}

export function clearTokens(): void {
  const tokensPath = getTokenPath();
  if (fs.existsSync(tokensPath)) {
    fs.unlinkSync(tokensPath);
  }
}
