type ConcurrencyStore = Map<string, number>;

declare global {
  var __deskmateConcurrencyLimitStore: ConcurrencyStore | undefined;
}

function getStore(): ConcurrencyStore {
  if (!globalThis.__deskmateConcurrencyLimitStore) {
    globalThis.__deskmateConcurrencyLimitStore = new Map<string, number>();
  }
  return globalThis.__deskmateConcurrencyLimitStore;
}

export type ConcurrencyLease = {
  allowed: boolean;
  active: number;
  limit: number;
  release: () => void;
};

export function acquireConcurrencySlot(params: {
  key: string;
  identifier: string;
  limit: number;
}): ConcurrencyLease {
  const store = getStore();
  const bucketKey = `${params.key}:${params.identifier}`;
  const active = store.get(bucketKey) ?? 0;

  if (active >= params.limit) {
    return {
      allowed: false,
      active,
      limit: params.limit,
      release: () => {},
    };
  }

  store.set(bucketKey, active + 1);
  let released = false;

  return {
    allowed: true,
    active: active + 1,
    limit: params.limit,
    release: () => {
      if (released) return;
      released = true;
      const current = store.get(bucketKey) ?? 0;
      if (current <= 1) {
        store.delete(bucketKey);
        return;
      }
      store.set(bucketKey, current - 1);
    },
  };
}

export function buildConcurrencyLimitHeaders(params: {
  active: number;
  limit: number;
}): HeadersInit {
  return {
    "X-Concurrency-Limit": String(params.limit),
    "X-Concurrency-Active": String(params.active),
  };
}

export function clearConcurrencyStoreForTests() {
  if (process.env.NODE_ENV === "test") {
    getStore().clear();
  }
}
