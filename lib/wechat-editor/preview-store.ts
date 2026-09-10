type PreviewRecord = {
  id: string;
  html: string;
  createdAt: string;
  expiresAt: string;
};

type PreviewStore = Map<string, PreviewRecord>;

declare global {
  var __wechatPreviewStore: PreviewStore | undefined;
}

function getStore() {
  if (!global.__wechatPreviewStore) {
    global.__wechatPreviewStore = new Map();
  }
  return global.__wechatPreviewStore;
}

export function savePreviewRecord(params: { id: string; html: string; ttlHours?: number }) {
  const now = Date.now();
  const ttl = (params.ttlHours ?? 24) * 60 * 60 * 1000;
  const record: PreviewRecord = {
    id: params.id,
    html: params.html,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };
  getStore().set(params.id, record);
  return record;
}

export function getPreviewRecord(id: string) {
  const record = getStore().get(id);
  if (!record) return null;
  if (Date.parse(record.expiresAt) < Date.now()) {
    getStore().delete(id);
    return null;
  }
  return record;
}

export function cleanupPreviewRecords() {
  const now = Date.now();
  const store = getStore();
  store.forEach((record, id) => {
    if (Date.parse(record.expiresAt) < now) {
      store.delete(id);
    }
  });
}
