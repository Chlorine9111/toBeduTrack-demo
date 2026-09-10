export async function* parseNDJSON<T>(
  response: Response,
): AsyncGenerator<T> {
  const body = response.body;
  if (!body) {
    return;
  }

  // 使用 body.getReader() + 手动 TextDecoder，避免 pipeThrough 在连接中断时
  // 产生 unhandled rejection（pipe 内部 Promise 链会泄漏 Event 对象）
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // 最后一个元素可能是不完整的行，保留在 buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") {
          continue;
        }
        if (trimmed === "[DONE]") {
          return;
        }
        yield JSON.parse(trimmed) as T;
      }
    }

    // 处理 buffer 中剩余的数据
    const remaining = buffer.trim();
    if (remaining !== "" && remaining !== "[DONE]") {
      yield JSON.parse(remaining) as T;
    }
  } finally {
    reader.releaseLock();
  }
}

function normalizeLessonStreamEvent(
  rawEvent: Record<string, unknown>,
): Record<string, unknown> | null {
  const type = typeof rawEvent.type === "string" ? rawEvent.type : "";
  const data =
    rawEvent.data && typeof rawEvent.data === "object" && !Array.isArray(rawEvent.data)
      ? (rawEvent.data as Record<string, unknown>)
      : {};

  if (type === "error") {
    return {
      type: "error",
      message:
        typeof rawEvent.errorText === "string" && rawEvent.errorText.trim().length > 0
          ? rawEvent.errorText
          : "教案生成失败",
    };
  }

  switch (type) {
    case "data-lesson-meta":
      return { type: "meta", ...data };
    case "data-lesson-section":
      return { type: "section", ...data };
    case "data-lesson-section-warning":
      return { type: "section_warning", ...data };
    case "data-lesson-warning":
      return { type: "warning", ...data };
    case "data-lesson-pipeline":
      return { type: "pipeline", ...data };
    case "data-lesson-complete":
      return { type: "complete", ...data };
    default:
      return null;
  }
}

export async function* parseSSEJson<T>(
  response: Response,
): AsyncGenerator<T> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processEvent = (eventText: string): T[] => {
    const dataLines = eventText
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
      return [];
    }

    const payload = dataLines.join("\n").trim();
    if (!payload || payload === "[DONE]") {
      return [];
    }

    return [JSON.parse(payload) as T];
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const eventText of events) {
        const parsedEvents = processEvent(eventText);
        for (const event of parsedEvents) {
          yield event;
        }
      }
    }

    const remainingEvents = processEvent(buffer);
    for (const event of remainingEvents) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseLessonStream(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    for await (const rawEvent of parseSSEJson<Record<string, unknown>>(response)) {
      const type = typeof rawEvent.type === "string" ? rawEvent.type : "";
      if (type === "error") {
        yield {
          type: "error",
          message:
            typeof rawEvent.errorText === "string" && rawEvent.errorText.trim().length > 0
              ? rawEvent.errorText
              : "教案生成失败",
        };
        continue;
      }

      if (type.startsWith("data-lesson-")) {
        const normalized = normalizeLessonStreamEvent(rawEvent);
        if (normalized) {
          yield normalized;
        }
      }
    }
    return;
  }

  for await (const rawEvent of parseNDJSON<Record<string, unknown>>(response)) {
    yield rawEvent;
  }
}
