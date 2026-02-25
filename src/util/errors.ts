import type { PuckError, PuckErrorCode } from "../types.js";

export class PuckApiError extends Error {
  public code: PuckErrorCode;
  public retryAfter?: number;
  public endpoint?: string;
  public details?: unknown;

  constructor(
    code: PuckErrorCode,
    message: string,
    opts?: { retryAfter?: number; endpoint?: string; details?: unknown },
  ) {
    super(message);
    this.name = "PuckApiError";
    this.code = code;
    this.retryAfter = opts?.retryAfter;
    this.endpoint = opts?.endpoint;
    this.details = opts?.details;
  }

  toPuckError(): PuckError {
    return {
      error: this.code,
      message: this.message,
      ...(this.retryAfter !== undefined && { retryAfter: this.retryAfter }),
      ...(this.endpoint !== undefined && { endpoint: this.endpoint }),
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

export class RateLimitError extends PuckApiError {
  constructor(
    endpoint: string,
    limit: number,
    resetAt: number,
  ) {
    const resetDate = new Date(resetAt * 1000);
    const retryAfter = Math.max(0, Math.ceil((resetAt * 1000 - Date.now()) / 1000));
    super("rate_limited", `${endpoint} rate limit reached (${limit}/window). Resets at ${resetDate.toISOString()}.`, {
      retryAfter,
      endpoint,
      details: { limit, remaining: 0, resetAt: resetDate.toISOString() },
    });
    this.name = "RateLimitError";
  }
}

export class AuthRequiredError extends PuckApiError {
  constructor(message = "Authentication required. Use puck_auth_status to check.") {
    super("auth_required", message);
    this.name = "AuthRequiredError";
  }
}

export class ContentTooLongError extends PuckApiError {
  constructor(weightedLength: number, maxLength: number) {
    super("content_too_long", `Post is ${weightedLength} characters (max ${maxLength}).`, {
      details: { weightedLength, maxLength },
    });
    this.name = "ContentTooLongError";
  }
}

export class MediaUploadError extends PuckApiError {
  constructor(message: string, details?: unknown) {
    super("media_failed", message, { details });
    this.name = "MediaUploadError";
  }
}

export class ThreadPartialError extends PuckApiError {
  constructor(
    failedAtIndex: number,
    postedIds: string[],
    cause: unknown,
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super("api_error", `Thread failed at post ${failedAtIndex + 1}: ${causeMessage}`, {
      details: { failedAtIndex, postedIds, cause: causeMessage },
    });
    this.name = "ThreadPartialError";
  }
}

export function toPuckError(err: unknown): PuckError {
  if (err instanceof PuckApiError) {
    return err.toPuckError();
  }

  if (err instanceof Error) {
    const apiError = err as unknown as Record<string, unknown>;

    // twitter-api-v2 error shapes
    if (apiError.code === 429 || apiError.rateLimitError) {
      return {
        error: "rate_limited",
        message: err.message,
        retryAfter: typeof apiError.rateLimit === "object" && apiError.rateLimit
          ? (apiError.rateLimit as Record<string, number>).reset
          : undefined,
      };
    }

    if (apiError.code === 401 || apiError.code === 403) {
      const statusCode = apiError.code as number;
      if (statusCode === 401) {
        return { error: "auth_failed", message: err.message };
      }
      return { error: "forbidden", message: err.message };
    }

    if (apiError.code === 404) {
      return { error: "not_found", message: err.message };
    }

    // twitter-api-v2 ApiResponseError
    if (typeof apiError.data === "object" && apiError.data) {
      const data = apiError.data as Record<string, unknown>;
      const errors = data.errors as Array<Record<string, unknown>> | undefined;
      if (errors && errors.length > 0) {
        const firstError = errors[0];
        const errorType = firstError.type as string | undefined;

        if (errorType?.includes("not-found") || errorType?.includes("resource-not-found")) {
          return { error: "not_found", message: err.message, details: errors };
        }
        if (errorType?.includes("forbidden") || errorType?.includes("disallowed-resource")) {
          return { error: "forbidden", message: err.message, details: errors };
        }
      }
      return { error: "api_error", message: err.message, details: data };
    }

    return { error: "api_error", message: err.message };
  }

  return { error: "api_error", message: String(err) };
}
