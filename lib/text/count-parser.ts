const CHINESE_DIGIT_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseChineseCountToken(token: string) {
  const normalized = token.trim();
  if (!normalized) return null;

  if (normalized === "十") return 10;
  if (normalized.startsWith("十")) {
    const tail = normalized.slice(1);
    const tailValue = tail ? CHINESE_DIGIT_MAP[tail] : 0;
    return tailValue === undefined ? null : 10 + tailValue;
  }
  if (normalized.endsWith("十")) {
    const head = normalized.slice(0, -1);
    const headValue = CHINESE_DIGIT_MAP[head];
    return headValue === undefined ? null : headValue * 10;
  }

  const tenIndex = normalized.indexOf("十");
  if (tenIndex > 0) {
    const head = normalized.slice(0, tenIndex);
    const tail = normalized.slice(tenIndex + 1);
    const headValue = CHINESE_DIGIT_MAP[head];
    const tailValue = tail ? CHINESE_DIGIT_MAP[tail] : 0;
    if (headValue === undefined || tailValue === undefined) return null;
    return headValue * 10 + tailValue;
  }

  return CHINESE_DIGIT_MAP[normalized] ?? null;
}

export function extractRequestedCount(text: string) {
  const digitMatch = text.match(/(\d{1,2})\s*(道|题|questions?)/i);
  if (digitMatch) {
    const value = Number(digitMatch[1]);
    return Number.isFinite(value) ? value : null;
  }

  const chineseMatch = text.match(/([零一二两三四五六七八九十]{1,3})\s*(道|题)/);
  if (!chineseMatch) return null;

  return parseChineseCountToken(chineseMatch[1]);
}
