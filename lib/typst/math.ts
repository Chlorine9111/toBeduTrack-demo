const COMMAND_MAP: Record<string, string> = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  epsilon: "epsilon",
  varepsilon: "epsilon.alt",
  theta: "theta",
  vartheta: "theta.alt",
  lambda: "lambda",
  mu: "mu",
  nu: "nu",
  pi: "pi",
  rho: "rho",
  sigma: "sigma",
  tau: "tau",
  phi: "phi",
  varphi: "phi.alt",
  chi: "chi",
  psi: "psi",
  omega: "omega",
  Gamma: "Gamma",
  Delta: "Delta",
  Theta: "Theta",
  Lambda: "Lambda",
  Pi: "Pi",
  Sigma: "Sigma",
  Phi: "Phi",
  Psi: "Psi",
  Omega: "Omega",
  cdot: "dot",
  times: "times",
  pm: "plus.minus",
  mp: "minus.plus",
  approx: "approx",
  neq: "!=",
  leq: "<=",
  le: "<=",
  geq: ">=",
  ge: ">=",
  to: "->",
  rightarrow: "->",
  leftarrow: "<-",
  Rightarrow: "=>",
  Leftarrow: "<=",
  infty: "infty",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  csc: "csc",
  sec: "sec",
  cot: "cot",
  ln: "ln",
  log: "log",
  lim: "lim",
  int: "integral",
  sum: "sum",
  prod: "product",
  cdots: "dots.h.c",
  ldots: "dots.h",
  degree: "degree",
};

const TEXT_COMMANDS = new Set(["text", "mathrm", "textrm", "operatorname", "mathbf"]);
const SPACING_COMMANDS = new Set([",", ";", ":", "!", "quad", "qquad", " "]);
const FUNCTION_COMMANDS = new Set([
  "sin",
  "cos",
  "tan",
  "csc",
  "sec",
  "cot",
  "ln",
  "log",
  "lim",
  "int",
  "sum",
  "prod",
]);
const OPERATOR_COMMANDS = new Set([
  "cdot",
  "times",
  "pm",
  "mp",
  "approx",
  "neq",
  "leq",
  "le",
  "geq",
  "ge",
  "to",
  "rightarrow",
  "leftarrow",
  "Rightarrow",
  "Leftarrow",
]);
const FRACTION_COMMANDS = new Set(["frac", "dfrac", "tfrac", "cfrac"]);
const IGNORED_LAYOUT_COMMANDS = new Set([
  "displaystyle",
  "textstyle",
  "scriptstyle",
  "scriptscriptstyle",
  "big",
  "Big",
  "bigg",
  "Bigg",
  "bigl",
  "bigr",
  "Bigl",
  "Bigr",
  "biggl",
  "biggr",
  "Biggl",
  "Biggr",
]);

type MathFragmentRole = "operand" | "operator" | "function" | "space";

type MathFragment = {
  value: string;
  end: number;
  role: MathFragmentRole;
};

function isLetter(char: string | undefined) {
  return Boolean(char && /[A-Za-z]/.test(char));
}

function skipWhitespace(source: string, index: number) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function stripMathDelimiters(source: string) {
  const trimmed = source.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith("\\(") && trimmed.endsWith("\\)")) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isDigit(char: string | undefined) {
  return Boolean(char && /[0-9]/.test(char));
}

function escapeTypstMathText(value: string) {
  return JSON.stringify(
    value
      .replace(/\s+/g, " ")
      .replace(/\\([{}[\]])/g, "$1")
      .trim(),
  );
}

function isBareAsciiWord(value: string) {
  return /^[A-Za-z]+$/.test(value);
}

function normalizeInlineWord(word: string) {
  if (word.length <= 1) {
    return word;
  }

  if (/^[A-Z]{2,}$/.test(word)) {
    return escapeTypstMathText(word);
  }

  if (isBareAsciiWord(word)) {
    return word.split("").join(" ");
  }

  return word;
}

function normalizeScriptValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (
    isBareAsciiWord(trimmed) &&
    trimmed.length > 1
  ) {
    return escapeTypstMathText(trimmed);
  }

  return trimmed;
}

function readBareWord(source: string, start: number) {
  let cursor = start;
  let value = "";
  while (cursor < source.length && isLetter(source[cursor])) {
    value += source[cursor];
    cursor += 1;
  }
  return { value, end: cursor };
}

function readNumber(source: string, start: number) {
  let cursor = start;
  let value = "";
  while (cursor < source.length) {
    const current = source[cursor] ?? "";
    if (!(/[0-9.]/.test(current))) {
      break;
    }
    value += current;
    cursor += 1;
  }
  return { value, end: cursor };
}

function readBalanced(
  source: string,
  start: number,
  openChar: string,
  closeChar: string,
) {
  if (source[start] !== openChar) {
    return { content: "", end: start };
  }

  let depth = 1;
  let cursor = start + 1;
  let content = "";

  while (cursor < source.length) {
    const char = source[cursor] ?? "";
    if (char === "\\" && cursor + 1 < source.length) {
      content += char;
      cursor += 1;
      content += source[cursor] ?? "";
      cursor += 1;
      continue;
    }
    if (char === openChar) {
      depth += 1;
      content += char;
      cursor += 1;
      continue;
    }
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return { content, end: cursor + 1 };
      }
      content += char;
      cursor += 1;
      continue;
    }
    content += char;
    cursor += 1;
  }

  return { content, end: source.length };
}

function convertGroupOrToken(source: string, start: number, options?: { script?: boolean }): MathFragment {
  const cursor = skipWhitespace(source, start);
  const current = source[cursor] ?? "";
  if (!current) {
    return { value: "", end: cursor, role: "space" };
  }

  if (current === "{") {
    const group = readBalanced(source, cursor, "{", "}");
    const groupText = group.content.trim();
    const normalizedGroup = options?.script && isBareAsciiWord(groupText) && groupText.length > 1
      ? escapeTypstMathText(groupText)
      : convertLatexToTypstMath(group.content);
    return {
      value: normalizedGroup,
      end: group.end,
      role: "operand",
    };
  }

  if (current === "[") {
    const group = readBalanced(source, cursor, "[", "]");
    return {
      value: convertLatexToTypstMath(group.content),
      end: group.end,
      role: "operand",
    };
  }

  if (current === "\\") {
    const token = convertLatexToken(source, cursor);
    return options?.script
      ? { ...token, value: normalizeScriptValue(token.value), role: "operand" }
      : token;
  }

  if (isLetter(current)) {
    const word = readBareWord(source, cursor);
    return {
      value: options?.script ? normalizeScriptValue(word.value) : normalizeInlineWord(word.value),
      end: word.end,
      role: "operand",
    };
  }

  if (isDigit(current)) {
    const numberToken = readNumber(source, cursor);
    return {
      value: numberToken.value,
      end: numberToken.end,
      role: "operand",
    };
  }

  return { value: current, end: cursor + 1, role: "operator" };
}

function convertLatexToken(source: string, start: number): MathFragment {
  const slashChar = source[start] ?? "";
  if (slashChar !== "\\") {
    return { value: slashChar, end: start + 1, role: "operator" };
  }

  const next = source[start + 1] ?? "";
  if (!next) {
    return { value: "", end: start + 1, role: "space" };
  }

  if (!isLetter(next)) {
    if (SPACING_COMMANDS.has(next)) {
      return { value: " ", end: start + 2, role: "space" };
    }
    if (next === "\\") {
      return { value: "\\\\", end: start + 2, role: "operator" };
    }
    return { value: next, end: start + 2, role: "operator" };
  }

  let cursor = start + 1;
  let command = "";
  while (cursor < source.length && isLetter(source[cursor])) {
    command += source[cursor];
    cursor += 1;
  }

  if (TEXT_COMMANDS.has(command)) {
    const token = convertGroupOrToken(source, cursor);
    return {
      value: escapeTypstMathText(token.value || ""),
      end: token.end,
      role: "operand",
    };
  }

  if (FRACTION_COMMANDS.has(command)) {
    const numerator = convertGroupOrToken(source, cursor);
    const denominator = convertGroupOrToken(source, numerator.end);
    return {
      value: `( ${numerator.value || " "} ) / ( ${denominator.value || " "} )`,
      end: denominator.end,
      role: "operand",
    };
  }

  if (IGNORED_LAYOUT_COMMANDS.has(command)) {
    return {
      value: "",
      end: cursor,
      role: "space",
    };
  }

  if (command === "sqrt") {
    const maybeIndex = source[skipWhitespace(source, cursor)] ?? "";
    if (maybeIndex === "[") {
      const indexGroup = readBalanced(source, skipWhitespace(source, cursor), "[", "]");
      const body = convertGroupOrToken(source, indexGroup.end);
      return {
        value: `root(${convertLatexToTypstMath(indexGroup.content) || "2"}, ${body.value || " "})`,
        end: body.end,
        role: "operand",
      };
    }

    const body = convertGroupOrToken(source, cursor);
    return {
      value: `sqrt(${body.value || " "})`,
      end: body.end,
      role: "operand",
    };
  }

  const mapped = COMMAND_MAP[command];
  return {
    value: mapped ?? command,
    end: cursor,
    role: FUNCTION_COMMANDS.has(command)
      ? "function"
      : OPERATOR_COMMANDS.has(command)
        ? "operator"
        : "operand",
  };
}

function isOperandLike(role: MathFragmentRole) {
  return role === "operand" || role === "function";
}

function isWordOperator(fragment: MathFragment | null) {
  return Boolean(
    fragment &&
    fragment.role === "operator" &&
    /^[A-Za-z][A-Za-z.]*$/.test(fragment.value),
  );
}

function needsImplicitSpace(previous: MathFragment | null, next: MathFragment) {
  if (!previous || !previous.value || !next.value) {
    return false;
  }
  if (previous.role === "space" || next.role === "space") {
    return false;
  }
  if (!isOperandLike(previous.role) || !isOperandLike(next.role)) {
    const previousWordOperator = isWordOperator(previous);
    const nextWordOperator = isWordOperator(next);
    if (
      (isOperandLike(previous.role) && nextWordOperator) ||
      (previousWordOperator && isOperandLike(next.role)) ||
      (previousWordOperator && nextWordOperator)
    ) {
      return true;
    }
    return false;
  }
  if (previous.role === "function" && next.value.startsWith("(")) {
    return false;
  }
  return true;
}

function pushFragment(fragments: MathFragment[], fragment: MathFragment) {
  if (!fragment.value) {
    return;
  }

  if (fragment.role === "space") {
    if (fragments.length === 0 || fragments[fragments.length - 1]?.role === "space") {
      return;
    }
    fragments.push(fragment);
    return;
  }

  const previous = fragments.length > 0 ? fragments[fragments.length - 1] ?? null : null;
  if (needsImplicitSpace(previous, fragment)) {
    fragments.push({ value: " ", end: fragment.end, role: "space" });
  }
  fragments.push(fragment);
}

function cleanupMath(result: string) {
  return result
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+,/g, ",")
    .replace(/,\s+/g, ", ")
    .replace(/\s+\/\s+/g, " / ")
    .replace(/\s+\^\s+/g, "^")
    .replace(/\s+_\s+/g, "_")
    .replace(/\s+\./g, ".")
    .trim();
}

export function convertLatexToTypstMath(source: string) {
  const input = stripMathDelimiters(source)
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\:/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\&/g, "&");

  let cursor = 0;
  const fragments: MathFragment[] = [];

  while (cursor < input.length) {
    const char = input[cursor] ?? "";
    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }

    if (char === "\\") {
      const token = convertLatexToken(input, cursor);
      pushFragment(fragments, token);
      cursor = token.end;
      continue;
    }

    if (char === "^" || char === "_") {
      const target = convertGroupOrToken(input, cursor + 1, { script: true });
      const scriptValue = normalizeScriptValue(target.value);
      const wrappedValue = scriptValue.length > 1 ? `(${scriptValue})` : scriptValue;
      const lastIndex = fragments.length - 1;
      if (lastIndex >= 0) {
        fragments[lastIndex] = {
          ...fragments[lastIndex],
          value: `${fragments[lastIndex]?.value ?? ""}${char}${wrappedValue}`,
        };
      } else {
        pushFragment(fragments, { value: `${char}${wrappedValue}`, end: target.end, role: "operand" });
      }
      cursor = target.end;
      continue;
    }

    if (char === "{") {
      const group = readBalanced(input, cursor, "{", "}");
      pushFragment(fragments, {
        value: `(${convertLatexToTypstMath(group.content)})`,
        end: group.end,
        role: "operand",
      });
      cursor = group.end;
      continue;
    }

    if (isLetter(char)) {
      const word = readBareWord(input, cursor);
      pushFragment(fragments, {
        value: normalizeInlineWord(word.value),
        end: word.end,
        role: "operand",
      });
      cursor = word.end;
      continue;
    }

    if (isDigit(char)) {
      const numberToken = readNumber(input, cursor);
      pushFragment(fragments, {
        value: numberToken.value,
        end: numberToken.end,
        role: "operand",
      });
      cursor = numberToken.end;
      continue;
    }

    pushFragment(fragments, { value: char, end: cursor + 1, role: "operator" });
    cursor += 1;
  }

  const output = fragments.map((fragment) => fragment.value).join("");
  return cleanupMath(output || " ");
}

export function renderInlineTypstMath(latex: string) {
  return `$${convertLatexToTypstMath(latex)}$`;
}

export function renderDisplayTypstMath(latex: string) {
  const math = convertLatexToTypstMath(latex);
  return `#math.equation(block: true, alt: ${JSON.stringify(latex.trim())}, $ ${math} $)`;
}
