export class InvalidJsonBodyError extends Error {
  constructor() {
    super("INVALID_JSON_BODY");
  }
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new InvalidJsonBodyError();
  }
}
