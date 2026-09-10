/**
 * AI SDK 语义缓存中间件
 *
 * 在模型层拦截 generate/stream 调用，对相同请求直接返回缓存结果。
 * AP 课程有限（~40 门 × ~10 单元 × 几种操作），缓存命中率可观。
 *
 * 当前使用内存 Map（开发阶段）；上线后换 Redis 只需改 get/set。
 */
import {
  type LanguageModelMiddleware,
  simulateReadableStream,
} from "ai";
import { createHash } from "node:crypto";

type CacheEntry = {
  result: unknown;
  createdAt: number;
};

type StreamCacheEntry = {
  chunks: StreamPart[];
  rest: Record<string, unknown>;
  createdAt: number;
};

type WrapGenerateParams = Parameters<
  Exclude<LanguageModelMiddleware["wrapGenerate"], undefined>
>[0];
type WrapStreamParams = Parameters<
  Exclude<LanguageModelMiddleware["wrapStream"], undefined>
>[0];
type StreamResult = Awaited<ReturnType<WrapStreamParams["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer T> ? T : never;

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

const generateCache = new Map<string, CacheEntry>();
const streamCache = new Map<string, StreamCacheEntry>();

function buildCacheKey(params: Record<string, unknown>, suffix: string): string {
  const { abortSignal: _signal, headers: _headers, ...serializable } = params as Record<
    string,
    unknown
  > & {
    abortSignal?: unknown;
    headers?: unknown;
  };

  const raw =
    JSON.stringify(serializable, (_key, value) => {
      if (typeof value === "function" || value === undefined) return null;
      return value;
    }) + suffix;

  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function evictStaleEntries(cache: Map<string, { createdAt: number }>, ttlMs: number) {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > ttlMs) {
      cache.delete(key);
    }
  }

  if (cache.size > MAX_CACHE_SIZE) {
    const keys = [...cache.keys()];
    for (let i = 0; i < keys.length - MAX_CACHE_SIZE; i += 1) {
      cache.delete(keys[i]!);
    }
  }
}

export const aiCacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate, params, model }: WrapGenerateParams) => {
    evictStaleEntries(generateCache, DEFAULT_TTL_MS);

    const cacheKey = buildCacheKey(
      params as unknown as Record<string, unknown>,
      `generate:${model.modelId}`,
    );

    const cached = generateCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < DEFAULT_TTL_MS) {
      console.info(`[ai-cache] HIT generate ${model.modelId} (${cacheKey.slice(0, 8)})`);
      const result = cached.result as Awaited<ReturnType<typeof doGenerate>>;
      return {
        ...result,
        response: {
          ...result.response,
          timestamp: result.response?.timestamp
            ? new Date(result.response.timestamp as unknown as string)
            : undefined,
        },
      };
    }

    const result = await doGenerate();
    generateCache.set(cacheKey, { result, createdAt: Date.now() });
    console.info(`[ai-cache] MISS generate ${model.modelId} (${cacheKey.slice(0, 8)})`);
    return result;
  },

  wrapStream: async ({ doStream, params, model }: WrapStreamParams) => {
    evictStaleEntries(streamCache, DEFAULT_TTL_MS);

    const cacheKey = buildCacheKey(
      params as unknown as Record<string, unknown>,
      `stream:${model.modelId}`,
    );

    const cached = streamCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < DEFAULT_TTL_MS) {
      console.info(`[ai-cache] HIT stream ${model.modelId} (${cacheKey.slice(0, 8)})`);
      const formattedChunks = cached.chunks.map((part) => {
        if (part.type === "response-metadata" && part.timestamp) {
          return { ...part, timestamp: new Date(part.timestamp as unknown as string) };
        }
        return part;
      });

      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 5,
          chunks: formattedChunks,
        }),
        ...cached.rest,
      };
    }

    const { stream, ...rest } = await doStream();
    const fullResponse: StreamPart[] = [];

    const transformStream = new TransformStream<StreamPart, StreamPart>({
      transform(chunk, controller) {
        fullResponse.push(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        streamCache.set(cacheKey, {
          chunks: fullResponse,
          rest: rest as Record<string, unknown>,
          createdAt: Date.now(),
        });
        console.info(`[ai-cache] STORED stream ${model.modelId} (${cacheKey.slice(0, 8)})`);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
