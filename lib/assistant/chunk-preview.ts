export function buildKnowledgeContentPreview(content: string, maxLength = 220) {
  const normalized = content
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;

  const lines = normalized.split("\n");
  const previewLines: string[] = [];
  let used = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const addition = (previewLines.length > 0 ? 1 : 0) + line.length;

    if (used + addition <= maxLength) {
      previewLines.push(line);
      used += addition;
      continue;
    }

    const available = Math.max(0, maxLength - used - (previewLines.length > 0 ? 1 : 0) - 3);
    if (available > 0 || previewLines.length === 0) {
      previewLines.push(`${line.slice(0, available)}...`);
    } else {
      previewLines.push("...");
    }
    return previewLines.join("\n").trim();
  }

  return previewLines.join("\n").trim();
}
