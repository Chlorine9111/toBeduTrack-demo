declare module "pg" {
  export type QueryResult<T = Record<string, unknown>> = {
    rows: T[];
  };

  export class Client {
    constructor(config?: {
      connectionString?: string;
      application_name?: string;
      statement_timeout?: number;
      query_timeout?: number;
    });

    connect(): Promise<void>;
    end(): Promise<void>;
    query<T = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<T>>;
  }
}
