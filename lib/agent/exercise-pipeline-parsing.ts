export function timeoutAfter<T>(ms: number, label: string): Promise<T> {
  return new Promise<T>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（>${ms}ms）`));
    }, ms);

    if (
      typeof timer === "object" &&
      "unref" in timer &&
      typeof timer.unref === "function"
    ) {
      timer.unref();
    }
  });
}

function stripCodeFence(raw: string) {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function extractJsonCandidates(raw: string) {
  const stripped = stripCodeFence(raw);
  if (!stripped) return [];

  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const item = value.trim();
    if (!item || seen.has(item)) return;
    seen.add(item);
    candidates.push(item);
  };

  push(stripped);

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        push(stripped.slice(start, i + 1));
        start = -1;
      }
    }
  }

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    push(stripped.slice(firstBrace, lastBrace + 1));
  }

  return candidates.sort((a, b) => b.length - a.length);
}

function fixInvalidJsonEscapes(raw: string): string {
  return raw.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4}|[\s\S])/g, (match) => {
    if (/^\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})$/.test(match)) {
      return match;
    }
    return `\\${match}`;
  });
}

function deepFixControlChars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj
      .replace(/\x08([a-z])/g, "\\b$1")
      .replace(/\x09([a-z])/g, "\\t$1")
      .replace(/\x0c([a-z])/g, "\\f$1")
      .replace(/\x0d([a-z])/g, "\\r$1")
      .replace(
        /\x0a(eq|u|abla|eg|otin|leq|geq|ewcommand|ewline|ightarrow|Rightarrow|ot(?:in|hing)?|subseteq|parallel|mid|equiv|approx|sim(?:eq)?)\b/g,
        "\\n$1",
      );
  }
  if (Array.isArray(obj)) return obj.map((item) => deepFixControlChars(item));
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        key,
        deepFixControlChars(value),
      ]),
    );
  }
  return obj;
}

export function parseJsonFromRawText(raw: string) {
  const candidates = extractJsonCandidates(raw);
  if (candidates.length === 0) {
    throw new Error("模型输出为空，未找到 JSON 内容");
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fixInvalidJsonEscapes(candidate));
      return deepFixControlChars(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("无法解析模型输出 JSON");
}
