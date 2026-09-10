type TableCapable = {
  from: unknown;
};

type InternalTableResult = {
  data?: unknown;
  error?: {
    message?: string | null;
    code?: string | null;
  } | null;
  count?: number | null;
};

type InternalTableQuery = PromiseLike<InternalTableResult> & {
  select: (...args: unknown[]) => InternalTableQuery;
  insert: (...args: unknown[]) => InternalTableQuery;
  update: (...args: unknown[]) => InternalTableQuery;
  upsert: (...args: unknown[]) => InternalTableQuery;
  delete: (...args: unknown[]) => InternalTableQuery;
  eq: (...args: unknown[]) => InternalTableQuery;
  in: (...args: unknown[]) => InternalTableQuery;
  gte: (...args: unknown[]) => InternalTableQuery;
  lte: (...args: unknown[]) => InternalTableQuery;
  order: (...args: unknown[]) => InternalTableQuery;
  limit: (...args: unknown[]) => InternalTableQuery;
  maybeSingle: (...args: unknown[]) => InternalTableQuery;
};

export function internalTable(client: TableCapable, tableName: string) {
  return (client.from as unknown as (name: string) => InternalTableQuery)(tableName);
}
