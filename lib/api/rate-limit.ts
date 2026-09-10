type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitBucket>;

declare global {
  var __deskmateRateLimitStore: RateLimitStore | undefined;
}

function getStore(): RateLimitStore {
  if (!globalThis.__deskmateRateLimitStore) {
    globalThis.__deskmateRateLimitStore = new Map<string, RateLimitBucket>();
  }
  return globalThis.__deskmateRateLimitStore;
}

export function getClientIdentifier(request: Request) {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  return "anonymous";
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

export function consumeRateLimit(params: {
  request: Request;
  key: string;
  limit: number;
  windowMs: number;
  identifier?: string;
}): RateLimitResult {
  const { request, key, limit, windowMs, identifier } = params;
  const now = Date.now();
  const actor = identifier ?? getClientIdentifier(request);
  const bucketKey = `${key}:${actor}`;
  const store = getStore();

  const bucket = store.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    store.set(bucketKey, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt,
      retryAfterSec: 0,
    };
  }

  if (bucket.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec,
    };
  }

  bucket.count += 1;
  store.set(bucketKey, bucket);
  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - bucket.count, 0),
    resetAt: bucket.resetAt,
    retryAfterSec: 0,
  };
}

export function buildRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : {
          "Retry-After": String(result.retryAfterSec),
        }),
  };
}

export function clearRateLimitStoreForTests() {
  if (process.env.NODE_ENV === "test") {
    getStore().clear();
  }
}
