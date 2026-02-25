export type ApiTier = "free" | "basic" | "pro" | "enterprise";

export interface PuckConfig {
  clientId: string;
  redirectUri: string;
  tokenPath: string;
  apiTier: ApiTier;
  logLevel: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
  userId?: string;
  scopes?: string[];
  expiresAt?: string;
  apiTier?: ApiTier;
  error?: string;
}

export interface RateLimitEntry {
  limit: number;
  remaining: number;
  resetAt: number;
}

export type PuckErrorCode =
  | "not_found"
  | "rate_limited"
  | "monthly_cap"
  | "auth_failed"
  | "auth_required"
  | "forbidden"
  | "invalid_request"
  | "content_too_long"
  | "media_failed"
  | "edit_expired"
  | "edit_limit"
  | "reply_restricted"
  | "api_error";

export interface PuckError {
  error: PuckErrorCode;
  message: string;
  details?: unknown;
  retryAfter?: number;
  endpoint?: string;
}

export interface PostCreateParams {
  text: string;
  replyToPostId?: string;
  quotePostId?: string;
  mediaIds?: string[];
  replySettings?: "following" | "mentionedUsers";
  poll?: {
    options: string[];
    durationMinutes: number;
  };
}

export interface PostData {
  id: string;
  text: string;
  authorId: string;
  authorName?: string;
  authorUsername?: string;
  createdAt?: string;
  conversationId?: string;
  inReplyToUserId?: string;
  referencedPosts?: Array<{
    type: "replied_to" | "quoted" | "retweeted";
    id: string;
  }>;
  publicMetrics?: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    impressionCount: number;
    bookmarkCount: number;
  };
  media?: Array<{
    mediaKey: string;
    type: string;
    url?: string;
    previewImageUrl?: string;
    altText?: string;
    width?: number;
    height?: number;
  }>;
  editHistoryTweetIds?: string[];
  editControls?: {
    editsRemaining: number;
    isEditEligible: boolean;
    editableUntil?: string;
  };
}

export interface PostResult {
  post: PostData;
}

export interface ThreadCreateResult {
  threadId: string;
  posts: PostData[];
  partialFailure?: {
    failedAtIndex: number;
    error: PuckError;
  };
}

export interface MediaUploadParams {
  filePath: string;
  altText?: string;
  mediaType?: string;
}

export interface MediaUploadResult {
  mediaId: string;
  mediaType: string;
  size?: number;
  expiresAt?: string;
  processingStatus?: string;
}

export interface TimelineParams {
  userId?: string;
  username?: string;
  maxResults?: number;
  paginationToken?: string;
}

export interface TimelineResult {
  posts: PostData[];
  nextToken?: string;
  resultCount: number;
}

export interface CharacterCountResult {
  weightedLength: number;
  maxLength: number;
  valid: boolean;
  remaining: number;
  displayRange: [number, number];
}
