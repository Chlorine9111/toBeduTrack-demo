function stripMarkdownDecorations(value: string) {
  return value
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();
}

export function normalizePlanTitle(rawTitle: string) {
  const cleaned = stripMarkdownDecorations(rawTitle).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const prefixMatch = cleaned.match(
    /^(?:[\u4e00-\u9fa5A-Za-z0-9\s/·&()-]{0,40})?(?:PBL\s*)?(?:项目|项目方案|项目设计|Project Plan)\s*[：:]\s*(.+)$/i,
  );
  if (prefixMatch?.[1]?.trim()) {
    return prefixMatch[1].trim();
  }

  return cleaned;
}

export function extractTitleFromMarkdown(markdown: string, fallback = "") {
  const titleMatch =
    markdown.match(/^#\s+(.+)$/m) ??
    markdown.match(/^\*\*(.+?)\*\*$/m);

  if (titleMatch?.[1]?.trim()) {
    return normalizePlanTitle(titleMatch[1]);
  }

  return normalizePlanTitle(fallback);
}

export function normalizeDrivingQuestion(rawQuestion: string) {
  const cleaned = stripMarkdownDecorations(rawQuestion)
    .replace(/^驱动[性]?问题\s*[：:]\s*/i, "")
    .replace(/^["“”'']+/, "")
    .replace(/["“”'']+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const lastQuestionEnd = Math.max(cleaned.lastIndexOf("？"), cleaned.lastIndexOf("?"));
  if (lastQuestionEnd >= 0) {
    return cleaned.slice(0, lastQuestionEnd + 1).trim();
  }

  return cleaned;
}

function shouldStopDrivingQuestionCapture(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^\*\*.+\*\*$/.test(trimmed) && /^(?:项目|教学|阶段|评价|评估|成果|课时|活动|资源|材料)/.test(stripMarkdownDecorations(trimmed))) {
    return true;
  }
  return false;
}

function collectQuestionLines(lines: string[], startIndex: number) {
  const collected: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (collected.length > 0 && shouldStopDrivingQuestionCapture(line)) {
      break;
    }

    const normalizedLine = normalizeDrivingQuestion(line);
    if (!normalizedLine) {
      if (collected.length > 0) {
        break;
      }
      continue;
    }

    collected.push(normalizedLine);
    if (/[？?]$/.test(normalizedLine)) {
      break;
    }
    if (collected.length >= 3) {
      break;
    }
  }

  return normalizeDrivingQuestion(collected.join(" "));
}

export function extractDrivingQuestionFromMarkdown(markdown: string, fallback = "") {
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const normalizedLine = stripMarkdownDecorations(trimmed);

    if (!/驱动[性]?问题/.test(normalizedLine)) {
      continue;
    }

    const inlineMatch = normalizedLine.match(/驱动[性]?问题\s*[：:]\s*(.+)$/);
    if (inlineMatch?.[1]?.trim()) {
      const inlineQuestion = normalizeDrivingQuestion(inlineMatch[1]);
      if (inlineQuestion.length >= 12) {
        return inlineQuestion;
      }
    }

    const collectedQuestion = collectQuestionLines(lines, index + 1);
    if (collectedQuestion.length >= 12) {
      return collectedQuestion;
    }
  }

  return normalizeDrivingQuestion(fallback);
}

export function summarizeMarkdownPlain(markdown: string, maxLength = 240) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`|_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
