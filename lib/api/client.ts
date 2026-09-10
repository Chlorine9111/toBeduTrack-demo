export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function cleanErrorText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

export function isFetchLikeClientError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const text = cleanErrorText(`${error.name} ${error.message}`).toLowerCase();
  return (
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("load failed") ||
    text.includes("networkerror") ||
    text.includes("network request failed")
  );
}

export function getClientRequestErrorMessage(
  error: unknown,
  options?: {
    fallbackMessage?: string;
    networkMessage?: string;
    timeoutMessage?: string;
  },
) {
  const fallbackMessage = options?.fallbackMessage ?? "请求失败，请稍后重试";
  const networkMessage = options?.networkMessage ?? "网络请求失败，请检查连接后重试";
  const timeoutMessage = options?.timeoutMessage ?? "请求超时，请重试";

  if (error instanceof DOMException && error.name === "AbortError") {
    return timeoutMessage;
  }

  if (isFetchLikeClientError(error)) {
    return networkMessage;
  }

  if (error instanceof ApiError) {
    return cleanErrorText(error.message) || fallbackMessage;
  }

  if (error instanceof Error) {
    return cleanErrorText(error.message) || fallbackMessage;
  }

  return fallbackMessage;
}

export function toClientRequestError(
  error: unknown,
  options?: {
    fallbackMessage?: string;
    networkMessage?: string;
    timeoutMessage?: string;
  },
) {
  const message = getClientRequestErrorMessage(error, options);
  if (error instanceof ApiError) {
    return new ApiError(error.status, message);
  }
  return new Error(message);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error?.message) {
        message = body.error.message;
      } else if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // 无法解析 body，使用默认 message
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(
  path: string,
  options?: { signal?: AbortSignal; headers?: HeadersInit },
): Promise<T> {
  try {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
      signal: options?.signal,
    });
    return handleResponse<T>(response);
  } catch (error) {
    throw toClientRequestError(error);
  }
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options?.signal?.reason);
  if (options?.signal) {
    if (options.signal.aborted) {
      relayAbort();
    } else {
      options.signal.addEventListener("abort", relayAbort, { once: true });
    }
  }
  const timer = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return handleResponse<T>(response);
    } catch (error) {
      throw toClientRequestError(error);
    }
  } finally {
    if (options?.signal) {
      options.signal.removeEventListener("abort", relayAbort);
    }
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options?.signal?.reason);
  if (options?.signal) {
    if (options.signal.aborted) {
      relayAbort();
    } else {
      options.signal.addEventListener("abort", relayAbort, { once: true });
    }
  }
  const timer = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    try {
      const response = await fetch(path, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return handleResponse<T>(response);
    } catch (error) {
      throw toClientRequestError(error);
    }
  } finally {
    if (options?.signal) {
      options.signal.removeEventListener("abort", relayAbort);
    }
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function apiDelete<T>(
  path: string,
  body?: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options?.signal?.reason);
  if (options?.signal) {
    if (options.signal.aborted) {
      relayAbort();
    } else {
      options.signal.addEventListener("abort", relayAbort, { once: true });
    }
  }
  const timer = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    try {
      const response = await fetch(path, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      return handleResponse<T>(response);
    } catch (error) {
      throw toClientRequestError(error);
    }
  } finally {
    if (options?.signal) {
      options.signal.removeEventListener("abort", relayAbort);
    }
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function apiPostFormData<T>(
  path: string,
  formData: FormData,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options?.signal?.reason);
  if (options?.signal) {
    if (options.signal.aborted) {
      relayAbort();
    } else {
      options.signal.addEventListener("abort", relayAbort, { once: true });
    }
  }
  const timer = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "include",
        body: formData,
        signal: controller.signal,
      });
      return handleResponse<T>(response);
    } catch (error) {
      throw toClientRequestError(error);
    }
  } finally {
    if (options?.signal) {
      options.signal.removeEventListener("abort", relayAbort);
    }
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function apiPostStream(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<Response> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options?.signal?.reason);
  if (options?.signal) {
    if (options.signal.aborted) {
      relayAbort();
    } else {
      options.signal.addEventListener("abort", relayAbort, { once: true });
    }
  }
  const timer = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (options?.signal) {
      options.signal.removeEventListener("abort", relayAbort);
    }
    if (timer !== undefined) clearTimeout(timer);
    throw toClientRequestError(err);
  }
  if (options?.signal) {
    options.signal.removeEventListener("abort", relayAbort);
  }
  if (timer !== undefined) clearTimeout(timer);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error?.message) {
        message = errorBody.error.message;
      } else if (typeof errorBody?.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // 无法解析 body，使用默认 message
    }
    throw new ApiError(response.status, message);
  }
  return response;
}
