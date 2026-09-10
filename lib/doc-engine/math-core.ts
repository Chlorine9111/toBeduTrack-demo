import katex from "katex";

const DISPLAY_DELIMITER_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
const INLINE_DELIMITER_PATTERN = /(?<!\$)\$([^\n$]+?)\$(?!\$)|\\\(([\s\S]+?)\\\)/g;
const EXPLICIT_MATH_SEGMENT_PATTERN =
  /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\n$]+?\$|\\\([\s\S]+?\\\)/g;
const ESCAPED_INLINE_DELIMITER_PATTERN = /\\\$([^\n$]+?)\\\$/g;
const BROKEN_MATH_TAG_ARTIFACT_PATTERN =
  /(?:\\?["']|&quot;|&#34;)?(?:&gt;|>)?\s*(?:&lt;\/math-(?:inline|display)&gt;|<\/math-(?:inline|display)>)/gi;
const HTML_TOKEN_PATTERN = /(<\/?[a-z][^>]*>|<![^>]*>)/gi;
const SKIP_TAGS = new Set(["math-inline", "math-display", "code", "pre"]);
const KNOWN_TEX_COMMAND_PATTERN =
  /\\(?:displaystyle|sum|prod|frac|dfrac|tfrac|cfrac|int|iint|iiint|oint|sqrt|leq|geq|neq|cdot|times|pm|mp|left|right|infty|pi|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Delta|Gamma|Theta|Lambda|Sigma|Phi|Psi|Omega|partial|nabla|mathrm|mathbf|mathit|mathbb|mathcal|text|textbf|lim|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|max|min|sup|inf|det|gcd|binom|dbinom|tbinom|vec|hat|bar|dot|ddot|tilde|overline|underline|overbrace|underbrace|stackrel|overset|underset|cancel|boxed|pmatrix|bmatrix|vmatrix|cases|begin|end|hline|quad|qquad|space|hspace|vspace|forall|exists|in|notin|subset|supset|cup|cap|neg|lor|land|to|mapsto|Rightarrow|Leftarrow|Leftrightarrow|rightarrow|leftarrow|leftrightarrow|uparrow|downarrow|circ|bullet|star|dagger|perp|angle|triangle|square|diamond|approx|equiv|sim|propto|cong|parallel|not)\b/;
const KNOWN_TEX_COMMAND_GLOBAL =
  /\\(?:displaystyle|sum|prod|frac|dfrac|tfrac|cfrac|int|iint|iiint|oint|sqrt|leq|geq|neq|cdot|times|pm|mp|left|right|infty|pi|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Delta|Gamma|Theta|Lambda|Sigma|Phi|Psi|Omega|partial|nabla|mathrm|mathbf|mathit|mathbb|mathcal|text|textbf|lim|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|max|min|sup|inf|det|gcd|binom|dbinom|tbinom|vec|hat|bar|dot|ddot|tilde|overline|underline|overbrace|underbrace|stackrel|overset|underset|cancel|boxed|pmatrix|bmatrix|vmatrix|cases|begin|end|hline|quad|qquad|space|hspace|vspace|forall|exists|in|notin|subset|supset|cup|cap|neg|lor|land|to|mapsto|Rightarrow|Leftarrow|Leftrightarrow|rightarrow|leftarrow|leftrightarrow|uparrow|downarrow|circ|bullet|star|dagger|perp|angle|triangle|square|diamond|approx|equiv|sim|propto|cong|parallel|not)\b/g;
const RAW_TEX_START_PATTERN = new RegExp(KNOWN_TEX_COMMAND_GLOBAL.source, "g");
const MATH_NOISE_PATTERN = /^[0-9A-Za-z+\-−=<>≤≥∞⋅·*/^(){}\[\],.:;'"`“”‘’|_\\\s]+$/;
const MATH_NOISE_EDGE_PATTERN = /^[0-9A-Za-z+\-−=<>≤≥∞∑∏ΣΠ√∫⋅·*/^(){}\[\],.:;'"`“”‘’|_\s\u200b]+$/;
const STRONG_MATH_SIGNAL_PATTERN = /[\\∑∏ΣΠ√∫∞≤≥=^_⋅·+\-−<>\[\](){}0-9]/;
const RELATION_COMMAND_START_PATTERN = /^\\(?:leq|geq|neq|lt|gt|approx|sim)\b/;
const STRUCTURED_RAW_TEX_START_PATTERN =
  /^\\(?:displaystyle|sum|prod|frac|dfrac|tfrac|cfrac|int|iint|iiint|oint|sqrt|lim|binom|dbinom|tbinom)\b/;
const DERIVATIVE_PATTERN = /\bd[a-z]?\/d[a-z]\b/;
const PRIME_MATH_PATTERN = /[a-zA-Z]'{1,3}(?:\(|$|\s*=)/;
const PIECEWISE_PLAINTEXT_PATTERN =
  /=\s*\{[^{}\n]{0,240}(?:\bfor\b|\bif\b|≤|≥|<|>)[^{}\n]{0,240}\}/i;
const MULTI_EQUATION_INLINE_PATTERN =
  /\b(?:[A-Za-z](?:\([^)]*\))?)\s*=\s*[^,.;\n]{0,140}(?:,|\band\b)\s*(?:[A-Za-z](?:\([^)]*\))?)\s*=\s*[^,.;\n]{0,180}/i;
const TRAILING_EQUATION_FRAGMENT_PATTERN =
  /(?:^|[\s(])[A-Za-z](?:[A-Za-z0-9]*|\([^)]*\)|'{1,3})*\s*=\s*$/;
const CODE_LINE_KEYWORD_PATTERN =
  /\b(?:int|double|float|boolean|String|char|long|short|byte|public|private|protected|static|final|class|interface|enum|return|new|if|else|for|while|switch|case|break|continue|System\.out|println|print|null|true|false)\b/;
const CODE_LINE_OPERATOR_PATTERN = /(?:\+\+|--|\+=|-=|\*=|\/=|%=|==|!=|&&|\|\|)/;
const KATEX_RENDER_OPTIONS = {
  throwOnError: false,
  strict: "warn" as const,
  trust: false,
  macros: {},
};
type KatexDisplayOutput = "html" | "htmlAndMathml";
const MATH_TAG_PATTERN =
  /<math-(inline|display)\b[^>]*data-latex=(['"])([\s\S]*?)\2[^>]*>(?:[\s\S]*?<\/math-(?:inline|display)>)?/gi;
const UNICODE_SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "ⁿ": "n",
  "⁺": "+",
  "⁻": "-",
};
const UNICODE_SUBSCRIPTS: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};
const GREEK_NAMES: Record<string, string> = {
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  epsilon: "\\epsilon",
  zeta: "\\zeta",
  eta: "\\eta",
  theta: "\\theta",
  kappa: "\\kappa",
  lambda: "\\lambda",
  mu: "\\mu",
  nu: "\\nu",
  xi: "\\xi",
  pi: "\\pi",
  rho: "\\rho",
  sigma: "\\sigma",
  tau: "\\tau",
  phi: "\\phi",
  chi: "\\chi",
  psi: "\\psi",
  omega: "\\omega",
  Delta: "\\Delta",
  Omega: "\\Omega",
  Sigma: "\\Sigma",
  Pi: "\\Pi",
  Theta: "\\Theta",
  Lambda: "\\Lambda",
  Phi: "\\Phi",
  Gamma: "\\Gamma",
};
const GREEK_PATTERN = new RegExp(`(?<!\\\\)\\b(${Object.keys(GREEK_NAMES).join("|")})\\b`, "g");
const FUNC_NAMES = ["sqrt", "sin", "cos", "tan", "log", "ln", "exp", "abs"];
const FUNC_CALL_PATTERN = new RegExp(`\\b(${FUNC_NAMES.join("|")})(\\()`, "g");
const VULGAR_FRACTIONS: Record<string, string> = {
  "½": "\\frac{1}{2}",
  "⅓": "\\frac{1}{3}",
  "⅔": "\\frac{2}{3}",
  "¼": "\\frac{1}{4}",
  "¾": "\\frac{3}{4}",
  "⅕": "\\frac{1}{5}",
  "⅖": "\\frac{2}{5}",
  "⅗": "\\frac{3}{5}",
  "⅘": "\\frac{4}{5}",
  "⅙": "\\frac{1}{6}",
  "⅚": "\\frac{5}{6}",
  "⅛": "\\frac{1}{8}",
  "⅜": "\\frac{3}{8}",
  "⅝": "\\frac{5}{8}",
  "⅞": "\\frac{7}{8}",
};
const GREEK_SYMBOLS: Record<string, string> = {
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  ε: "\\epsilon",
  ζ: "\\zeta",
  η: "\\eta",
  θ: "\\theta",
  ι: "\\iota",
  κ: "\\kappa",
  λ: "\\lambda",
  μ: "\\mu",
  ν: "\\nu",
  ξ: "\\xi",
  π: "\\pi",
  ρ: "\\rho",
  σ: "\\sigma",
  τ: "\\tau",
  φ: "\\phi",
  χ: "\\chi",
  ψ: "\\psi",
  ω: "\\omega",
  Γ: "\\Gamma",
  Δ: "\\Delta",
  Θ: "\\Theta",
  Λ: "\\Lambda",
  Ξ: "\\Xi",
  Π: "\\Pi",
  Σ: "\\Sigma",
  Φ: "\\Phi",
  Ψ: "\\Psi",
  Ω: "\\Omega",
};
const GREEK_SYMBOL_PATTERN = new RegExp(
  `[${Object.keys(GREEK_SYMBOLS).join("")}]`,
  "g",
);
const CHEMICAL_ELEMENT_SYMBOLS = [
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
  "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
  "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
  "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
  "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
  "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
];
const CHEMICAL_ELEMENT_PATTERN_SOURCE = [...CHEMICAL_ELEMENT_SYMBOLS]
  .sort((left, right) => right.length - left.length)
  .join("|");
const CHEMICAL_ISOTOPE_SLASH_PATTERN =
  new RegExp(
    String.raw`\b(\d{1,3})\s*\/\s*(\d{1,3})\s*(${CHEMICAL_ELEMENT_PATTERN_SOURCE})(?:\s*\(\s*Z\s*=\s*(\d{1,3})\s*\))?`,
    "g",
  );
const CHEMICAL_ISOTOPE_SUPER_PATTERN =
  new RegExp(
    String.raw`(?<![\\$])\^\{?(\d{1,3})\}?(?:_\{?(\d{1,3})\}?)?\s*(${CHEMICAL_ELEMENT_PATTERN_SOURCE})(?:\s*\(\s*Z\s*=\s*(\d{1,3})\s*\))?`,
    "g",
  );
const CAN_RENDER_CACHE_LIMIT = 2048;
const canRenderLatexCache = new Map<string, boolean>();

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function wrapRenderedMath(html: string, displayMode: boolean) {
  return displayMode
    ? `<span class="deskmate-math-display">${html}</span>`
    : `<span class="deskmate-math-inline">${html}</span>`;
}

function normalizeLatexAttribute(latex: string) {
  return decodeHtmlEntities(latex).replace(/\u200b/g, "").trim();
}

function wrapInlineLatexLiteral(latex: string) {
  const normalized = repairExplicitMathLatex(latex);
  return normalized ? `$${normalized}$` : `$${latex}$`;
}

function wrapCompactMathGroup(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return `(${trimmed.slice(1, -1).trim()})`;
  }
  return `(${trimmed})`;
}

function buildChemicalIsotopeLatex(params: {
  massNumber: string;
  atomicNumber?: string | null;
  element: string;
  displayedZ?: string | null;
}) {
  const normalizedMass = params.massNumber.trim();
  const normalizedAtomic =
    params.atomicNumber?.trim() || params.displayedZ?.trim() || "";
  const normalizedElement = params.element.trim();
  const zSuffix = params.displayedZ?.trim()
    ? String.raw`\,( \mathrm{Z}=${params.displayedZ.trim()} )`
    : "";

  if (!normalizedMass || !normalizedElement) {
    return "";
  }

  const nucleus = normalizedAtomic
    ? String.raw`{}_{${normalizedAtomic}}^{${normalizedMass}}\mathrm{${normalizedElement}}`
    : String.raw`{}^{${normalizedMass}}\mathrm{${normalizedElement}}`;

  return `${nucleus}${zSuffix}`;
}

function normalizeChemicalIsotopePlainText(text: string) {
  if (!text) return text;

  return text
    .replace(
      CHEMICAL_ISOTOPE_SLASH_PATTERN,
      (_match, massNumber: string, atomicNumber: string, element: string, displayedZ?: string) =>
        createMathTag(
          buildChemicalIsotopeLatex({
            massNumber,
            atomicNumber,
            element,
            displayedZ,
          }),
          false,
        ),
    )
    .replace(
      CHEMICAL_ISOTOPE_SUPER_PATTERN,
      (_match, massNumber: string, atomicNumber: string | undefined, element: string, displayedZ?: string) =>
        createMathTag(
          buildChemicalIsotopeLatex({
            massNumber,
            atomicNumber: atomicNumber ?? null,
            element,
            displayedZ,
          }),
          false,
        ),
    );
}

function normalizeChemicalIsotopeSegments(text: string) {
  if (!text) return text;
  if (!/\/\s*\d+\s*[A-Z]|\^\{?\d+\}?/.test(text)) {
    return text;
  }

  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EXPLICIT_MATH_SEGMENT_PATTERN)) {
    const start = match.index ?? -1;
    if (start < 0) continue;

    parts.push(
      mapTextOutsideSkippedTags(
        text.slice(lastIndex, start),
        normalizeChemicalIsotopePlainText,
      ),
    );
    parts.push(match[0]);
    lastIndex = start + match[0].length;
  }

  parts.push(
    mapTextOutsideSkippedTags(
      text.slice(lastIndex),
      normalizeChemicalIsotopePlainText,
    ),
  );
  return parts.join("");
}

function normalizeCompactPlainTextLimitExpression(value: string) {
  const trimmed = value.trim().replace(/\s{2,}/g, " ");
  if (!trimmed) return trimmed;

  const quotientMatch = trimmed.match(/^\[\s*([\s\S]+?)\s*\]\s*\/\s*([\s\S]+)$/);
  if (quotientMatch) {
    const numerator = quotientMatch[1]?.trim() ?? "";
    const denominator = quotientMatch[2]?.trim() ?? "";
    if (numerator && denominator) {
      return `${wrapCompactMathGroup(numerator)}/${wrapCompactMathGroup(denominator)}`;
    }
  }

  const bracketOnlyMatch = trimmed.match(/^\[\s*([\s\S]+?)\s*\]$/);
  if (bracketOnlyMatch) {
    const inner = bracketOnlyMatch[1]?.trim() ?? "";
    if (inner) {
      return wrapCompactMathGroup(inner);
    }
  }

  return trimmed;
}

function normalizeStandaloneStructuredRawLatexLiteral(text: string) {
  if (!text || containsHtmlTagLikeMarkup(text)) {
    return text;
  }

  const match = text.match(/^(\s*)(\\(?:displaystyle|sum|prod|frac|dfrac|tfrac|cfrac|int|iint|iiint|oint|sqrt|lim|binom|dbinom|tbinom)\b[\s\S]*?)(\s*)$/);
  if (!match) {
    return text;
  }

  const [, leadingWhitespace, rawLatex, trailingWhitespace] = match;
  const normalizedLatex = repairExplicitMathLatex(rawLatex.trim());
  if (!normalizedLatex || hasLikelyProseTail(normalizedLatex)) {
    return text;
  }

  const displayMode = /\\displaystyle/.test(normalizedLatex);
  if (!canRenderLatex(normalizedLatex, displayMode)) {
    return text;
  }

  return `${leadingWhitespace}${wrapInlineLatexLiteral(normalizedLatex)}${trailingWhitespace}`;
}

function normalizeLimitApproachTarget(value: string) {
  const normalized = value
    .replace(/[−–—]/g, "-")
    .replace(/∞/g, "\\infty")
    .replace(/≤/g, " \\leq ")
    .replace(/≥/g, " \\geq ")
    .replace(/≠/g, " \\neq ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalized.replace(
    /(?<!\^)(\\infty|[A-Za-z0-9)\]}]+)([+-])$/,
    "$1^{$2}",
  );
}

function normalizeLimitCondition(value: string) {
  const normalized = value
    .replace(/[−–—]/g, "-")
    .replace(/\s*(?:→|\\to)\s*/g, " \\to ")
    .replace(/≤/g, " \\leq ")
    .replace(/≥/g, " \\geq ")
    .replace(/≠/g, " \\neq ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const match = normalized.match(/^(.+?)\s*\\to\s*(.+)$/);
  if (!match) {
    return normalized;
  }

  const variable = match[1]?.trim() ?? "";
  const target = match[2]?.trim() ?? "";
  if (!variable || !target) {
    return normalized;
  }

  return `${variable} \\to ${normalizeLimitApproachTarget(target)}`;
}

function looksLikeEscapedMathSegment(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    KNOWN_TEX_COMMAND_PATTERN.test(trimmed) ||
    /[_^∑∏ΣΠ∞≤≥√∛∜]/.test(trimmed) ||
    /[A-Za-z0-9)}]\^[A-Za-z0-9{(]/.test(trimmed)
  );
}

export function repairExplicitMathLatex(latex: string) {
  return normalizePlainTextMathLatex(
    normalizeLatexAttribute(latex)
      .replace(/\\\\(?=[A-Za-z])/g, "\\")
      .replace(
        /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Sigma|Phi|Psi|Omega)(?=[A-Za-z0-9])/g,
        "\\$1 ",
      )
      .replace(/\\Sigma\b/g, "\\sum")
      .replace(/\\Pi\b/g, "\\prod")
      .replace(/([_^])∞/g, "$1{\\infty}")
      .replace(/∞/g, "\\infty")
      .replace(/≤/g, "\\leq ")
      .replace(/≥/g, "\\geq ")
      .replace(/[−–—]/g, "-")
      .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (match) => VULGAR_FRACTIONS[match] ?? match)
      .replace(/∛\s*\(([^()\n]+)\)/g, "\\sqrt[3]{$1}")
      .replace(/∜\s*\(([^()\n]+)\)/g, "\\sqrt[4]{$1}")
      .replace(/√\s*\(([^()\n]+)\)/g, "\\sqrt{$1}")
      .replace(/∛([A-Za-z0-9]+)/g, "\\sqrt[3]{$1}")
      .replace(/∜([A-Za-z0-9]+)/g, "\\sqrt[4]{$1}")
      .replace(/√([A-Za-z0-9]+)/g, "\\sqrt{$1}")
      .replace(
        /(?<!\\)\b(sin|cos|tan|sec|csc|cot|log|ln)(\^\{[^}]+\}|\^\S+)\(/g,
        "\\$1$2(",
      )
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

function repairDollarWrappedLatexArguments(text: string) {
  if (!text || !text.includes("$") || !/\\[A-Za-z]+/.test(text)) {
    return text;
  }

  let current = text;
  let previous = "";

  do {
    previous = current;
    current = current
      .replace(
        /\\([A-Za-z]+)\(\s*\$([^\n$]+?)\$\s*\)/g,
        (_match, command: string, inner: string) =>
          `\\${command}(${repairExplicitMathLatex(inner.trim())})`,
      )
      .replace(
        /\\([A-Za-z]+)\{\s*\$([^\n$]+?)\$\s*\}/g,
        (_match, command: string, inner: string) =>
          `\\${command}{${repairExplicitMathLatex(inner.trim())}}`,
      )
      .replace(
        /\\([A-Za-z]+)\[\s*\$([^\n$]+?)\$\s*\]/g,
        (_match, command: string, inner: string) =>
          `\\${command}[${repairExplicitMathLatex(inner.trim())}]`,
      )
      .replace(
        /\\((?:d|t|c)?frac|(?:d|t)?binom)\{\s*\$?([^$\n]+?)\$?\s*\}\{\s*\$?([^$\n]+?)\$?\s*\}/g,
        (_match, command: string, left: string, right: string) =>
          `\\${command}{${repairExplicitMathLatex(left.trim())}}{${repairExplicitMathLatex(right.trim())}}`,
      );
  } while (current !== previous);

  return current;
}

function normalizeEscapedInlineMathDelimiters(text: string) {
  if (!text || !text.includes("\\$")) return text;

  return text.replace(ESCAPED_INLINE_DELIMITER_PATTERN, (match, latex: string) => {
    if (!looksLikeEscapedMathSegment(latex)) {
      return match;
    }

    return `$${repairExplicitMathLatex(latex)}$`;
  });
}

function countUnmatchedBracketBalance(
  value: string,
  openChar: string,
  closeChar: string,
) {
  let balance = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = index > 0 ? value[index - 1] : "";
    if (previous === "\\") continue;
    if (char === openChar) balance += 1;
    if (char === closeChar) balance = Math.max(0, balance - 1);
  }

  return balance;
}

function hasBrokenInlineMathStructure(latex: string) {
  const trimmed = latex.trim();
  if (!trimmed) return false;
  if (/\$\$/.test(trimmed)) return true;
  if (countUnmatchedBracketBalance(trimmed, "(", ")") > 0) return true;
  if (countUnmatchedBracketBalance(trimmed, "[", "]") > 0) return true;
  if (countUnmatchedBracketBalance(trimmed, "{", "}") > 0) return true;
  if (/\\[A-Za-z]+$/.test(trimmed)) return true;

  return /(?:[+\-−*/=^_({\\]|\\(?:sin|cos|tan|sec|csc|cot|log|ln|lim|sqrt)\([^)]*)$/.test(
    trimmed,
  );
}

function normalizeBrokenInlineLatexFragment(value: string) {
  return repairExplicitMathLatex(
    value
      .replace(/\$\$/g, " ")
      .replace(/\$(?=\S)/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

function shouldMergeBrokenInlineMathSegments(leftLatex: string, rightLatex: string) {
  const left = leftLatex.trim();
  const right = rightLatex.trim();
  if (!left || !right) return false;

  if (hasBrokenInlineMathStructure(left)) return true;
  if (/\\[A-Za-z]+$/.test(left) && /^[A-Za-z]+/.test(right)) return true;

  const leftLooksMathLike =
    looksLikeEscapedMathSegment(left) ||
    isLikelyMathContinuationTail(left) ||
    /[=^_!\/∑∏ΣΠ∞π·⋯+\-−\\]/.test(left);
  const rightLooksMathLike =
    looksLikeEscapedMathSegment(right) ||
    isLikelyMathContinuationTail(right) ||
    /^[A-Za-z]+/.test(right);

  if (leftLooksMathLike && rightLooksMathLike) {
    return true;
  }

  return (
    /(?:[+\-−*/=^_({\\]|\\(?:sin|cos|tan|sec|csc|cot|log|ln|lim|sqrt))$/.test(
      left,
    ) &&
    isLikelyMathContinuationTail(right)
  );
}

function foldLeadingLimitKeywordIntoInlineMath(text: string) {
  return text.replace(/\blim\s+\$([^\n$]+?)\$/g, (match, latex: string) => {
    const trimmed = latex.trim();
    if (!trimmed || /^\\lim\b/.test(trimmed)) {
      return match;
    }

    const limitMatch = trimmed.match(
      /^([A-Za-z]\s*(?:\\to|→)\s*(?:\\infty|∞|[A-Za-z0-9.+-]+))(?:\s+|$)([\s\S]*)$/,
    );
    if (!limitMatch) {
      return match;
    }

    const condition = limitMatch[1]?.trim() ?? "";
    const remainder = limitMatch[2]?.trim() ?? "";
    if (!condition || !remainder) {
      return match;
    }

    return `$${normalizeBrokenInlineLatexFragment(
      `\\lim_{${normalizeLimitCondition(condition)}} ${remainder}`,
    )}$`;
  });
}

function repairSplitLatexCommandsAcrossDollarBoundary(text: string) {
  return text.replace(
    /\\([A-Za-z]{1,10})\$([A-Za-z]{1,10})([^$\n<]*)\$/g,
    (match, leftCommand: string, rightCommand: string, tail: string) => {
      const trimmedTail = tail.trim();
      if (!trimmedTail || !isLikelyMathContinuationTail(trimmedTail)) {
        return match;
      }

      return `$${normalizeBrokenInlineLatexFragment(
        `\\${leftCommand}${rightCommand} ${trimmedTail}`,
      )}$`;
    },
  );
}

function looksLikeShortMathPrefix(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (containsHtmlTagLikeMarkup(trimmed) || /[\u4e00-\u9fff]/.test(trimmed)) {
    return false;
  }

  return (
    /^[A-Za-z]$/.test(trimmed) ||
    /^(?:sin|cos|tan|sec|csc|cot|log|ln|exp)\s+[A-Za-z]$/i.test(trimmed)
  );
}

function foldLeadingMathPrefixIntoInlineMath(text: string) {
  return text.replace(
    /(^|[\s([{:;,])((?:sin|cos|tan|sec|csc|cot|log|ln|exp)\s+[A-Za-z]|[A-Za-z])\s+\$([=<>][^\n$]+?)\$/g,
    (match, boundary: string, prefix: string, latex: string) => {
      if (!looksLikeShortMathPrefix(prefix)) {
        return match;
      }

      const combined = normalizeBrokenInlineLatexFragment(
        `${prefix.trim()} ${latex.trim()}`,
      );
      if (!combined || !canRenderLatex(combined, false)) {
        return match;
      }

      return `${boundary}$${combined}$`;
    },
  );
}

function foldShortMathPrefixBeforeRawLatexFunction(text: string) {
  return text.replace(
    /(^|[\s([{:;,])([A-Za-z])\s+(\\(?:sin|cos|tan|sec|csc|cot|log|ln|exp)(?:\^\{-1\}|\^\{[^}]+\})?(?:\([^)\n]*\)|\{[^}\n]*\}))/g,
    (match, boundary: string, prefix: string, latex: string) => {
      const combined = `${prefix} ${repairExplicitMathLatex(latex.trim())}`;
      if (!canRenderLatex(combined, false)) {
        return match;
      }
      return `${boundary}$${combined}$`;
    },
  );
}

function foldShortMathNeighborsAroundInlineFunction(text: string) {
  return text.replace(
    /\b([A-Za-z])\s+\$((?:\\)?(?:sin|cos|tan|sec|csc|cot|log|ln|exp)(?:\^\{-1\}|\^\{[^}]+\})?)\$\s+([A-Za-z])\b/g,
    (match, left: string, latex: string, right: string) => {
      const combined = normalizeBrokenInlineLatexFragment(
        `${left} ${latex.trim()} ${right}`,
      );
      if (!combined || !canRenderLatex(combined, false)) {
        return match;
      }

      return `$${combined}$`;
    },
  );
}

function repairDanglingInlineMathAtLineEnd(text: string) {
  return text.replace(/(^|[\s([{:;,])\$([^$\n]+)$/gm, (match, boundary: string, rawLatex: string) => {
    const normalizedLatex = normalizeBrokenInlineLatexFragment(rawLatex);
    if (!normalizedLatex) {
      return match;
    }
    if (
      !looksLikeEscapedMathSegment(normalizedLatex) &&
      !isLikelyMathContinuationTail(normalizedLatex)
    ) {
      return match;
    }
    if (!canRenderLatex(normalizedLatex, false)) {
      return match;
    }

    return `${boundary}$${normalizedLatex}$`;
  });
}

function foldLeadingPlainTextLimitIntoInlineMath(text: string) {
  return text.replace(
    /\blim\s+([A-Za-z])\s*(?:→|\\to)\s*\$([^\n$]+?)\$/g,
    (match, variable: string, latex: string) => {
      const trimmed = latex.trim();
      const limitMatch = trimmed.match(
        /^(\\[A-Za-z]+|∞|[A-Za-z0-9.+-]+)(?:\s+|$)([\s\S]*)$/,
      );
      if (!limitMatch) {
        return match;
      }

      const limit = limitMatch[1]?.trim() ?? "";
      const remainder = limitMatch[2]?.trim() ?? "";
      if (!limit || !remainder) {
        return match;
      }

      return `$${normalizeBrokenInlineLatexFragment(
        `\\lim_{${normalizeLimitCondition(`${variable} \\to ${limit}`)}} ${remainder}`,
      )}$`;
    },
  );
}

export function repairBrokenInlineMathDelimiters(text: string) {
  if (!text || !text.includes("$")) return text;

  let current = text;
  let changed = false;
  const canApplySingleLineHeuristics = !current.includes("\n");

  do {
    changed = false;

    if (canApplySingleLineHeuristics) {
      const repairedLatexArguments = repairDollarWrappedLatexArguments(current);
      if (repairedLatexArguments !== current) {
        current = repairedLatexArguments;
        changed = true;
      }
    }

    const repairedSplitCommands = repairSplitLatexCommandsAcrossDollarBoundary(current);
    if (repairedSplitCommands !== current) {
      current = repairedSplitCommands;
      changed = true;
    }

    const mergedDoubleDollar = current.replace(
      /\$([^\n$]+?)\$\$([^\n$]+?)\$/g,
      (match, leftLatex: string, rightLatex: string) => {
        if (!shouldMergeBrokenInlineMathSegments(leftLatex, rightLatex)) {
          return match;
        }

        changed = true;
        return `$${normalizeBrokenInlineLatexFragment(
          `${leftLatex} ${rightLatex}`,
        )}$`;
      },
    );
    if (mergedDoubleDollar !== current) {
      current = mergedDoubleDollar;
      changed = true;
    }

    const mergedTrailingTail = current.replace(
      /\$([^\n$]+?)\$(?!\$)([^$\n<]+)/g,
      (match, latex: string, trailingText: string) => {
        const normalizedLatex = normalizeBrokenInlineLatexFragment(latex);

        const factorialTailMatch = trailingText.match(/^(\s*)(!)([\s\S]*)$/);
        if (factorialTailMatch) {
          const leadingWhitespace = factorialTailMatch[1] ?? "";
          const remainder = factorialTailMatch[3] ?? "";
          changed = true;
          return `$${normalizeBrokenInlineLatexFragment(
            `${normalizedLatex}!`,
          )}$${leadingWhitespace}${remainder}`;
        }

        if (!hasBrokenInlineMathStructure(latex)) {
          return match;
        }

        const { candidate, remainder } =
          extractLeadingMathContinuation(trailingText);
        if (!candidate || !isLikelyMathContinuationTail(candidate)) {
          return match;
        }

        changed = true;
        return `$${normalizeBrokenInlineLatexFragment(
          `${normalizedLatex} ${candidate}`,
        )}$${remainder}`;
      },
    );
    if (mergedTrailingTail !== current) {
      current = mergedTrailingTail;
      changed = true;
    }

    const foldedLeadingLimitKeyword = foldLeadingLimitKeywordIntoInlineMath(current);
    if (foldedLeadingLimitKeyword !== current) {
      current = foldedLeadingLimitKeyword;
      changed = true;
    }

    const foldedPlainTextLimit = foldLeadingPlainTextLimitIntoInlineMath(current);
    if (foldedPlainTextLimit !== current) {
      current = foldedPlainTextLimit;
      changed = true;
    }

    if (canApplySingleLineHeuristics) {
      const foldedLeadingPrefix = foldLeadingMathPrefixIntoInlineMath(current);
      if (foldedLeadingPrefix !== current) {
        current = foldedLeadingPrefix;
        changed = true;
      }

      const foldedRawLatexPrefix = foldShortMathPrefixBeforeRawLatexFunction(current);
      if (foldedRawLatexPrefix !== current) {
        current = foldedRawLatexPrefix;
        changed = true;
      }

      const foldedFunctionNeighbors = foldShortMathNeighborsAroundInlineFunction(current);
      if (foldedFunctionNeighbors !== current) {
        current = foldedFunctionNeighbors;
        changed = true;
      }

      const repairedDanglingInlineMath = repairDanglingInlineMathAtLineEnd(current);
      if (repairedDanglingInlineMath !== current) {
        current = repairedDanglingInlineMath;
        changed = true;
      }
    }
  } while (changed);

  return current;
}

function stripBrokenMathTagArtifacts(text: string) {
  if (!text) return text;
  return text.replace(BROKEN_MATH_TAG_ARTIFACT_PATTERN, "");
}

function mapTextOutsideSkippedTags(
  value: string,
  transform: (text: string) => string,
) {
  if (!value) return value;

  const depth = new Map<string, number>();
  const isInsideSkippedTag = () =>
    Array.from(SKIP_TAGS).some((tag) => (depth.get(tag) ?? 0) > 0);

  return value
    .split(HTML_TOKEN_PATTERN)
    .map((token) => {
      if (!token.startsWith("<")) {
        return isInsideSkippedTag() ? token : transform(token);
      }

      const tagMatch = token.match(/^<\s*(\/)?\s*([a-z0-9-]+)/i);
      const tagName = tagMatch?.[2]?.toLowerCase();
      if (tagName && SKIP_TAGS.has(tagName)) {
        const isClosing = Boolean(tagMatch?.[1]);
        const isSelfClosing = /\/\s*>$/.test(token);
        const nextDepth = depth.get(tagName) ?? 0;

        if (isClosing) {
          depth.set(tagName, Math.max(0, nextDepth - 1));
        } else if (!isSelfClosing) {
          depth.set(tagName, nextDepth + 1);
        }
      }

      return token;
    })
    .join("");
}

function normalizeUnicodeMathText(text: string) {
  return text
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]+/g, (match) =>
      `^{${[...match].map((char) => UNICODE_SUPERSCRIPTS[char] ?? char).join("")}}`,
    )
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (match) =>
      `_{${[...match].map((char) => UNICODE_SUBSCRIPTS[char] ?? char).join("")}}`,
    );
}

function normalizePlainTextSubscriptAtom(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^\{[\s\S]+\}$/.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9]$/.test(trimmed)) return trimmed;
  return `{${trimmed}}`;
}

function buildPlainTextSubscriptChain(parts: string[]) {
  if (parts.length === 0) return "";
  return parts.reduce((current, part, index) => {
    const normalizedPart = normalizePlainTextSubscriptAtom(part);
    if (index === 0) {
      return normalizedPart;
    }
    return `${current}_${normalizedPart}`;
  }, "");
}

function normalizeNamedGreekIdentifierWithSubscripts(value: string) {
  return value.replace(
    new RegExp(
      `(?<!\\\\)\\b(?:${Object.keys(GREEK_NAMES).join("|")})(?:_[A-Za-z0-9]+)+`,
      "g",
    ),
    (match) => {
      const [name, ...parts] = match.split("_");
      const greekCommand = GREEK_NAMES[name] ?? name;
      const subscriptChain = buildPlainTextSubscriptChain(parts);
      if (!subscriptChain) {
        return greekCommand;
      }
      return `${greekCommand}_{${subscriptChain}}`;
    },
  );
}

function looksLikeSeriesMathClause(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (containsHtmlTagLikeMarkup(trimmed) || /[\u4e00-\u9fff]/.test(trimmed)) {
    return false;
  }
  if (
    !/[∑∏ΣΠ∞πθλμΩΔΦΓαβγδεζηικλμνξρστυφχψω^_!·⋯]/.test(trimmed) &&
    !/\.\.\./.test(trimmed)
  ) {
    return false;
  }
  if (!/[0-9A-Za-z()]/.test(trimmed)) {
    return false;
  }

  const longWords = trimmed.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    ["sin", "cos", "tan", "log", "ln", "lim", "exp", "max", "min"].includes(
      word.toLowerCase(),
    ),
  );
}

function looksLikePlainTextMathToken(token: string) {
  if (/[∑∏ΣΠ√∫∞]/.test(token)) return true;
  if (GREEK_SYMBOL_PATTERN.test(token)) {
    GREEK_SYMBOL_PATTERN.lastIndex = 0;
    return true;
  }
  GREEK_SYMBOL_PATTERN.lastIndex = 0;
  if (/→/.test(token) && /[A-Za-z0-9]/.test(token)) return true;
  if (/[≤≥]/.test(token) && /[A-Za-z0-9]/.test(token)) return true;
  if (/[A-Za-z]_[A-Za-z0-9]/.test(token)) return true;
  if (/[A-Za-z0-9)}]\^[A-Za-z0-9{(]/.test(token)) return true;
  if (/[A-Za-z0-9)}]\!/.test(token) || /\([^)]+\)!/.test(token)) return true;
  if (
    /^[A-Za-z0-9()+\-−*/^]+\/[A-Za-z0-9()+\-−*/^!]+[.,;:?]?$/.test(token)
  ) {
    return true;
  }
  if (/^(?:⋯|···|\.\.\.)$/.test(token)) return true;
  if (/\b(?:sqrt|sin|cos|tan|sec|csc|cot|log|ln)\s*\(/.test(token)) return true;
  if (/\blim\[[^\]]+\]/.test(token)) return true;
  if (/\blim\s*\([^()\n]*?(?:→|\\to)[^()\n]*?\)/.test(token)) return true;
  if (/[A-Za-z]\*[A-Za-z]/.test(token)) return true;
  if (DERIVATIVE_PATTERN.test(token)) return true;
  if (/[a-zA-Z]'{1,3}(?:\(|$)/.test(token)) return true;
  if (/\b(?:sin|cos|tan|sec|csc|cot)\^/.test(token)) return true;
  if (
    /^\d+[a-zA-Z][,;.]?$/.test(token) &&
    !/^\d+(?:st|nd|rd|th|D|G|K|A|B)[,;.]?$/i.test(token)
  ) {
    return true;
  }
  if (GREEK_PATTERN.test(token) && /[_^*\/+\-=<>]/.test(token)) {
    GREEK_PATTERN.lastIndex = 0;
    return true;
  }
  GREEK_PATTERN.lastIndex = 0;
  return false;
}

function isPlainTextMathOperator(value: string) {
  return /^[+\-−*/=<>≤≥≠≈·×÷|]+$/.test(value.trim());
}

function startsPlainTextSumOrProduct(value: string) {
  return /^[∑∏ΣΠ]\s*\(/.test(value.trim());
}

function isPlainTextLimitLikeToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^\\lim_\{/.test(trimmed) || /^lim$/i.test(trimmed) || /\blim\s*(?:\[|\(|[A-Za-z])/.test(trimmed);
}

function isSimpleFunctionCallToken(value: string) {
  const trimmed = value.trim().replace(/[.,;:?]+$/g, "");
  if (!trimmed) return false;
  return /^[A-Za-z](?:'{1,3})?\([^()\n]*\)$/.test(trimmed);
}

function isBarePlainTextLimitKeyword(value: string) {
  return /^lim$/i.test(value.trim());
}

function isPlainTextLimitApproachConditionToken(value: string) {
  const trimmed = value.trim().replace(/[.,;:?]+$/g, "");
  if (!trimmed) return false;
  return /^(?:as\s*)?[A-Za-z]\s*(?:→|\\to)\s*(?:\\infty|∞|[A-Za-z0-9.+-]+)$/.test(trimmed);
}

function bufferContainsLimitKeyword(parts: string[]) {
  return parts.some((value) => isPlainTextLimitLikeToken(value));
}

function isPlainTextSumOrProductConnector(value: string) {
  return /^to$/i.test(value.trim());
}

function isShortPlainTextVariable(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(?:pH|pOH)$/.test(trimmed)) return true;
  if (/^[a-zΔΣΩαβγδεζηθικλμνξπρσςτυφχψω]{1,2}$/.test(trimmed)) return true;
  if (/^[A-Z]{2,4}$/.test(trimmed)) return true;
  return false;
}

function isEquationTailVariable(value: string) {
  return /^[a-zΔαβγδεζηθικλμνξπρσςτυφχψω]$/.test(value.trim());
}

function isSignedPlainTextNumber(value: string) {
  return /^[+\-−]\d+(?:\.\d+)?[.,;:?]?$/.test(value.trim());
}

function isPlainTextNumber(value: string) {
  return /^\d+(?:\.\d+)?[.,;:?]?$/.test(value.trim());
}

function isEquationTailMathExpression(value: string) {
  const trimmed = value.trim().replace(/[.,;:?]+$/g, "");
  if (!trimmed) return false;
  if (/[<>≤≥]/.test(trimmed)) return true;
  if (/[()]/.test(trimmed) && /[_^*/+\-−]/.test(trimmed)) return true;
  if (/^[A-Za-z0-9+\-−*/^()]+\/[A-Za-z0-9+\-−*/^()]+$/.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z0-9+\-−*/^()]+(?:[+\-−][A-Za-z0-9+\-−*/^()]+)+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function hasRiskyPlainTextMathPattern(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return (
    PIECEWISE_PLAINTEXT_PATTERN.test(trimmed) ||
    MULTI_EQUATION_INLINE_PATTERN.test(trimmed) ||
    TRAILING_EQUATION_FRAGMENT_PATTERN.test(trimmed)
  );
}

function isLikelyCodeLikeLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^```/.test(trimmed)) return true;
  if (/\/\*|\*\/|\/\/|System\.out\b/.test(trimmed)) return true;
  if (/^[{}]+$/.test(trimmed)) return true;
  if (/^\s*(?:public|private|protected|static|final|class|interface|enum)\b/.test(trimmed)) {
    return true;
  }

  if (!/[;{}]/.test(trimmed)) {
    return false;
  }

  if (CODE_LINE_KEYWORD_PATTERN.test(trimmed) || CODE_LINE_OPERATOR_PATTERN.test(trimmed)) {
    return true;
  }

  if (
    /^\s*[A-Za-z_$][\w$<>\[\]]*\s+[A-Za-z_$][\w$]*(?:\s*=\s*[^;]+)?;\s*$/.test(trimmed)
  ) {
    return true;
  }

  if (/^\s*[A-Za-z_$][\w$.]*\s*(?:\+\+|--|[+\-*/%]?=)\s*[^;]+;\s*$/.test(trimmed)) {
    return true;
  }

  if (/^\s*[A-Za-z_$][\w$.]*\s*\([^)]*\);\s*$/.test(trimmed)) {
    return true;
  }

  return false;
}

function protectLikelyCodeLines(text: string) {
  if (!text) {
    return {
      text,
      restore(value: string) {
        return value;
      },
    };
  }

  const replacements: Array<{ placeholder: string; original: string }> = [];
  const protectedText = text
    .split(/(\n+)/)
    .map((part) => {
      if (part.includes("\n") || !isLikelyCodeLikeLine(part)) {
        return part;
      }

      const placeholder = `DESKMATECODELINETOKEN${replacements.length}END`;
      replacements.push({
        placeholder,
        original: part,
      });
      return placeholder;
    })
    .join("");

  return {
    text: protectedText,
    restore(value: string) {
      return replacements.reduce(
        (current, item) => current.replaceAll(item.placeholder, item.original),
        value,
      );
    },
  };
}

function normalizePlainTextMathLatex(value: string): string {
  return value
    .replace(
      /(?<!\\left)(?<!\\right)\|([^|\n]+)\|/g,
      (match, inner: string) => {
        const trimmed = inner.trim();
        if (!trimmed) return match;
        if (!/[A-Za-z0-9\\_^+\-−*/()]/.test(trimmed)) {
          return match;
        }
        return `\\left|${trimmed}\\right|`;
      },
    )
    .replace(/\\lim_\{([^{}]+)\}/g, (_match, condition: string) => {
      return `\\lim_{${normalizeLimitCondition(condition)}}`;
    })
    .replace(
      /\b(?<!\\)lim\s+([^\n]+?)\s+as\s*([A-Za-z]\s*(?:→|\\to)\s*(?:\\infty|∞|[A-Za-z0-9.+-]+))/g,
      (_match, expression: string, condition: string) =>
        `\\lim_{${normalizeLimitCondition(condition)}} ${expression.trim()}`,
    )
    .replace(
      /\b(?<!\\)lim\s+([A-Za-z])\s*(?:\\to|→)\s*(\\infty|∞|[A-Za-z0-9.+-]+)/g,
      (_match, variable: string, limit: string) =>
        `\\lim_{${normalizeLimitCondition(`${variable} \\to ${limit}`)}}`,
    )
    .replace(
      /\blim\s*\(\s*([^()\n]*?(?:→|\\to)[^()\n]*?)\s*\)/g,
      (_match, condition: string) =>
        `\\lim_{${normalizeLimitCondition(condition)}}`,
    )
    .replace(
      /([∑∏ΣΠ])\s*\(\s*([A-Za-z])\s*=\s*([^()]+?)\s*(?:\\to|to|→)\s*([^()]+?)\s*\)\s*/g,
      (_match, operator: string, variable: string, start: string, end: string) => {
        const command =
          operator === "∏" || operator === "Π" ? "\\prod" : "\\sum";
        const normalizedStart = normalizePlainTextMathLatex(start.trim());
        const normalizedEnd = normalizePlainTextMathLatex(end.trim());
        return `${command}_{${variable}=${normalizedStart}}^{${normalizedEnd}} `;
      },
    )
    .replace(
      /([∑∏ΣΠ])\s*([A-Za-z])\s*=\s*([^()\s{}]+?)\s*\^\{([^}]+)\}\s*/g,
      (_match, operator: string, variable: string, start: string, end: string) => {
        const command =
          operator === "∏" || operator === "Π" ? "\\prod" : "\\sum";
        return `${command}_{${variable}=${normalizePlainTextMathLatex(
          start.trim(),
        )}}^{${normalizePlainTextMathLatex(end.trim())}} `;
      },
    )
    .replace(/\bd([a-z])\/d([a-z])\b/g, "\\frac{d$1}{d$2}")
    .replace(/\bd\/d([a-z])\b/g, "\\frac{d}{d$1}")
    .replace(/\blim\s*\[([^\]]+)\]/g, (match, condition: string) => {
      if (!/(?:→|\\to)/.test(condition)) {
        return match;
      }
      return `\\lim_{${normalizeLimitCondition(condition)}}`;
    })
    .replace(/\bsqrt\(([^)]*)\)/g, "\\sqrt{$1}")
    .replace(/(?<!\\)\b(sin|cos|tan|sec|csc|cot)\^\{?(\d+)\}?/g, "\\$1^{$2}")
    .replace(/(?<!\\)\b(sin|cos|tan|sec|csc|cot|log|ln|exp)\(/g, "\\$1(")
    .replace(/(?<!\\)\b(sin|cos|tan|sec|csc|cot|log|ln|lim)\b(?!\^|[a-zA-Z])/g, "\\$1")
    .replace(
      /(?<!\\)\b(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Delta|Gamma|Theta|Lambda|Sigma|Phi|Psi|Omega)(?:_[A-Za-z0-9]+)+/g,
      (match) => normalizeNamedGreekIdentifierWithSubscripts(match),
    )
    .replace(GREEK_PATTERN, (_match, name: string) => GREEK_NAMES[name] ?? name)
    .replace(GREEK_SYMBOL_PATTERN, (match) => GREEK_SYMBOLS[match] ?? match)
    .replace(
      /(?<!\\)\b([A-Za-z]+)(?:_[A-Za-z0-9]+)+/g,
      (match, base: string) => {
        const [identifier, ...parts] = match.split("_");
        if (identifier !== base) {
          return match;
        }
        if (/^(?:data|snake|case|value|label)$/i.test(identifier)) {
          return match;
        }
        if (parts.length === 0) {
          return match;
        }
        return `${identifier}_{${buildPlainTextSubscriptChain(parts)}}`;
      },
    )
    .replace(/\^\(([^()\n]+)\)/g, "^{$1}")
    .replace(/(?:\.\.\.|···|⋯)/g, " \\cdots ")
    .replace(/\*/g, "\\cdot ")
    .replace(/·/g, "\\cdot ")
    .replace(/−/g, "-")
    .replace(/→/g, " \\to ")
    .replace(/≤/g, " \\leq ")
    .replace(/≥/g, " \\geq ")
    .replace(/≠/g, " \\neq ")
    .replace(/∞/g, "\\infty")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function convertPlainTextMathRuns(text: string) {
  if (!text) return text;
  if (hasRiskyPlainTextMathPattern(text)) {
    return text;
  }
  if (/\\[A-Za-z]+/.test(text)) {
    return text;
  }
  if (
    !/[_^*∫∑∞≤≥]/.test(text) &&
    !/\blim\s*(?:\[|\(|[A-Za-z])/.test(text) &&
    !FUNC_CALL_PATTERN.test(text) &&
    !DERIVATIVE_PATTERN.test(text) &&
    !PRIME_MATH_PATTERN.test(text)
  ) {
    FUNC_CALL_PATTERN.lastIndex = 0;
    return text;
  }
  FUNC_CALL_PATTERN.lastIndex = 0;

  const segments = text.split(/(?<=\s)|(?=\s)/);
  const result: string[] = [];
  let mathBuffer: string[] = [];

  function splitTrailingMathPunctuation(value: string) {
    const match = value.match(/^(.*?)([.,;:?，。；：]+)$/);
    if (!match) {
      return { core: value, punctuation: "" };
    }

    const core = match[1] ?? "";
    if (!core.trim()) {
      return { core: value, punctuation: "" };
    }

    return {
      core,
      punctuation: match[2] ?? "",
    };
  }

  function flushMathBuffer() {
    if (mathBuffer.length === 0) return;
    const raw = mathBuffer.join("");
    const leadingWhitespace = raw.match(/^\s*/)?.[0] ?? "";
    const trailingWhitespace = raw.match(/\s*$/)?.[0] ?? "";
    const trimmed = raw.trim();
    const { core, punctuation } = splitTrailingMathPunctuation(trimmed);
    const latex = normalizePlainTextMathLatex(core);
    result.push(
      `${leadingWhitespace}${latex ? `$${latex}$` : core}${punctuation}${trailingWhitespace}`,
    );
    mathBuffer = [];
  }

  function hasFollowingMathContinuation(startIndex: number) {
    for (
      let cursor = startIndex;
      cursor < segments.length && cursor <= startIndex + 5;
      cursor += 1
    ) {
      const future = segments[cursor];
      if (/^\s+$/.test(future)) continue;
      return (
        looksLikePlainTextMathToken(future) ||
        isPlainTextMathOperator(future) ||
        isSimpleFunctionCallToken(future) ||
        isPlainTextLimitApproachConditionToken(future) ||
        isShortPlainTextVariable(future) ||
        isPlainTextNumber(future) ||
        isSignedPlainTextNumber(future) ||
        isEquationTailMathExpression(future)
      );
    }
    return false;
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (/^\s+$/.test(segment)) {
      if (mathBuffer.length > 0) {
        mathBuffer.push(segment);
      } else {
        result.push(segment);
      }
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      /[.!?。；;:]\s*$/.test(mathBuffer.join("").trimEnd())
    ) {
      flushMathBuffer();
    }

    if (looksLikePlainTextMathToken(segment)) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length === 0 &&
      isBarePlainTextLimitKeyword(segment) &&
      hasFollowingMathContinuation(index + 1)
    ) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length === 0 &&
      (isPlainTextNumber(segment) ||
        isSignedPlainTextNumber(segment) ||
        isPlainTextMathOperator(segment)) &&
      hasFollowingMathContinuation(index + 1)
    ) {
      mathBuffer.push(segment);
      continue;
    }

    const previousMathToken = [...mathBuffer]
      .reverse()
      .find((value) => !/^\s+$/.test(value)) ?? "";

    if (mathBuffer.length > 0 && isSignedPlainTextNumber(segment)) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      isPlainTextLimitLikeToken(previousMathToken) &&
      (isSimpleFunctionCallToken(segment) || isEquationTailMathExpression(segment))
    ) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      bufferContainsLimitKeyword(mathBuffer) &&
      isPlainTextLimitApproachConditionToken(segment)
    ) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      bufferContainsLimitKeyword(mathBuffer) &&
      /^as$/i.test(segment.trim()) &&
      hasFollowingMathContinuation(index + 1)
    ) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      startsPlainTextSumOrProduct(previousMathToken) &&
      isPlainTextSumOrProductConnector(segment)
    ) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      isPlainTextMathOperator(previousMathToken) &&
      (
        isEquationTailVariable(segment) ||
        isPlainTextNumber(segment) ||
        isEquationTailMathExpression(segment)
      )
    ) {
      mathBuffer.push(segment);
      continue;
    }

    if (
      mathBuffer.length > 0 &&
      (isPlainTextMathOperator(segment) || isShortPlainTextVariable(segment))
    ) {
      const hasFollowingMath = hasFollowingMathContinuation(index + 1);
      if (hasFollowingMath) {
        mathBuffer.push(segment);
        continue;
      }
    }

    flushMathBuffer();
    result.push(segment);
  }

  flushMathBuffer();
  return result.join("");
}

function normalizeSeriesKeywordTails(text: string) {
  if (!text || !/\bseries\b/i.test(text)) return text;

  return text.replace(
    /(\bseries\s+)([\s\S]+?)(?=(?:\s+\b(?:is|are|was|were|converges|diverges|equals|has)\b|[?;\n]|$))/gi,
    (match, prefix: string, candidate: string) => {
      const trimmed = candidate.trim();
      if (
        !trimmed ||
        trimmed.includes("$") ||
        trimmed.includes("\\(") ||
        trimmed.includes("\\[")
      ) {
        return match;
      }
      if (!looksLikeSeriesMathClause(trimmed)) {
        return match;
      }
      return `${prefix}$${normalizePlainTextMathLatex(
        normalizeUnicodeMathText(trimmed),
      )}$`;
    },
  );
}

function repairSplitDelimitedSumProductExpressions(text: string) {
  if (!text || !/[∑∏ΣΠ]/.test(text) || !text.includes("$")) {
    return text;
  }

  return text.replace(
    /([∑∏ΣΠ])\s*\(\s*([A-Za-z])\s*=\s*([^()$\n]+?)\s*(?:\\to|to|→)\s*\$([^$]*?)\)\s*([^$]+?)\$/g,
    (
      match,
      operator: string,
      variable: string,
      start: string,
      end: string,
      body: string,
    ) => {
      const normalizedEnd = repairExplicitMathLatex(end.trim());
      const normalizedBody = repairExplicitMathLatex(body.trim());
      if (!normalizedEnd || !normalizedBody) {
        return match;
      }

      const command =
        operator === "∏" || operator === "Π" ? "\\prod" : "\\sum";
      return `$${command}_{${variable}=${normalizePlainTextMathLatex(
        start.trim(),
      )}}^{${normalizedEnd}} ${normalizedBody}$`;
    },
  );
}

function normalizePlainTextMathSegments(text: string) {
  if (!text) return text;

  const source = normalizeStandaloneStructuredRawLatexLiteral(
    normalizeScrambledPlainTextLimitClauses(text),
  );

  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(EXPLICIT_MATH_SEGMENT_PATTERN)) {
    const start = match.index ?? -1;
    if (start < 0) continue;

    const prefix = source.slice(lastIndex, start);
    const normalizedPrefix = normalizeDuplicatedRawLatexClusters(
      normalizeUnicodeMathText(prefix),
    );
    parts.push(mapTextOutsideSkippedTags(normalizedPrefix, convertPlainTextMathRuns));
    parts.push(match[0]);
    lastIndex = start + match[0].length;
  }

  const trailing = normalizeDuplicatedRawLatexClusters(
    normalizeUnicodeMathText(source.slice(lastIndex)),
  );
  parts.push(mapTextOutsideSkippedTags(trailing, convertPlainTextMathRuns));
  return parts.join("");
}

function normalizeBareRawLatexOutsideExplicitSegments(text: string) {
  if (!text || !KNOWN_TEX_COMMAND_PATTERN.test(text)) {
    return text;
  }

  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EXPLICIT_MATH_SEGMENT_PATTERN)) {
    const start = match.index ?? -1;
    if (start < 0) continue;

    parts.push(normalizeDuplicatedRawLatexClusters(text.slice(lastIndex, start)));
    parts.push(match[0]);
    lastIndex = start + match[0].length;
  }

  parts.push(normalizeDuplicatedRawLatexClusters(text.slice(lastIndex)));
  return parts.join("");
}

function containsHtmlTagLikeMarkup(value: string) {
  return /<\/?[a-z][^>]*>/i.test(value) || /<![^>]*>/i.test(value);
}

function normalizeComparableMathText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<annotation[\s\S]*?<\/annotation>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[\u200b\s]+/g, "")
    .replace(/−/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/⋅|·/g, "*")
    .replace(/[“”‘’'"]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeScrambledPlainTextLimitClauses(text: string) {
  if (!text || !/\blim\b/.test(text)) return text;

  return text
    .replace(
      /\b(?<!\\)lim\s+([^\n]+?)\s+(is|are|was|were)\s+as\s*([A-Za-z]\s*(?:→|\\to)\s*(?:\\infty|∞|[A-Za-z0-9.+-]+))/g,
      (_match, expression: string, copula: string, condition: string) =>
        `${wrapInlineLatexLiteral(`\\lim_{${normalizeLimitCondition(condition)}} ${normalizeCompactPlainTextLimitExpression(expression)}`)} ${copula}`,
    )
    .replace(
      /\b(?<!\\)lim\s+([^\n]+?)\s+as\s*([A-Za-z]\s*(?:→|\\to)\s*(?:\\infty|∞|[A-Za-z0-9.+-]+))/g,
      (_match, expression: string, condition: string) =>
        wrapInlineLatexLiteral(
          `\\lim_{${normalizeLimitCondition(condition)}} ${normalizeCompactPlainTextLimitExpression(expression)}`,
        ),
    )
    .replace(
      /\b(?<!\\)lim\s+(\[\s*[^\]\n]+?\s*\]\s*\/\s*[^\s,;:?]+(?:\([^)\n]*\)|\^\{[^}]+\}|[A-Za-z0-9]+)*)/g,
      (_match, expression: string) =>
        wrapInlineLatexLiteral(`\\lim ${normalizeCompactPlainTextLimitExpression(expression)}`),
    );
}

function isLikelyMathNoiseChunk(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (containsHtmlTagLikeMarkup(trimmed) || /[\u4e00-\u9fff]/.test(trimmed)) {
    return false;
  }
  if (!MATH_NOISE_EDGE_PATTERN.test(trimmed) || !STRONG_MATH_SIGNAL_PATTERN.test(trimmed)) {
    return false;
  }

  const longWords = trimmed.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    ["sin", "cos", "tan", "log", "ln", "lim", "max", "min"].includes(word.toLowerCase()),
  );
}

function renderLatexToComparableText(latex: string, displayMode: boolean) {
  const normalizedLatex = repairExplicitMathLatex(latex);
  if (!normalizedLatex) return "";

  try {
    const mathMl = katex.renderToString(normalizedLatex, {
      ...KATEX_RENDER_OPTIONS,
      displayMode,
      output: "mathml",
    });
    return normalizeComparableMathText(mathMl);
  } catch {
    return normalizeComparableMathText(normalizedLatex);
  }
}

function canRenderLatex(latex: string, displayMode: boolean) {
  const normalizedLatex = repairExplicitMathLatex(latex);
  if (!normalizedLatex) return false;
  const cacheKey = `${displayMode ? "display" : "inline"}:${normalizedLatex}`;
  const cached = canRenderLatexCache.get(cacheKey);
  if (cached != null) {
    return cached;
  }

  try {
    katex.renderToString(normalizedLatex, {
      ...KATEX_RENDER_OPTIONS,
      displayMode,
      throwOnError: true,
      output: "html" satisfies KatexDisplayOutput,
    });
    if (canRenderLatexCache.size >= CAN_RENDER_CACHE_LIMIT) {
      const oldestKey = canRenderLatexCache.keys().next().value;
      if (oldestKey) {
        canRenderLatexCache.delete(oldestKey);
      }
    }
    canRenderLatexCache.set(cacheKey, true);
    return true;
  } catch {
    if (canRenderLatexCache.size >= CAN_RENDER_CACHE_LIMIT) {
      const oldestKey = canRenderLatexCache.keys().next().value;
      if (oldestKey) {
        canRenderLatexCache.delete(oldestKey);
      }
    }
    canRenderLatexCache.set(cacheKey, false);
    return false;
  }
}

function overlapLength(a: string, b: string) {
  const maxLength = Math.min(16, a.length, b.length);
  for (let size = maxLength; size >= 3; size -= 1) {
    if (
      a.includes(b.slice(0, size)) ||
      a.includes(b.slice(-size)) ||
      b.includes(a.slice(0, size)) ||
      b.includes(a.slice(-size))
    ) {
      return size;
    }
  }
  return 0;
}

function overlapsRenderedMath(noise: string, rendered: string) {
  const normalizedNoise = normalizeComparableMathText(noise);
  if (!normalizedNoise || !rendered) return false;
  if (rendered.includes(normalizedNoise) || normalizedNoise.includes(rendered)) {
    return true;
  }
  return overlapLength(normalizedNoise, rendered) >= 4;
}

function extractTrailingMathNoise(prefix: string) {
  const match = prefix.match(/[0-9A-Za-z+\-−=<>≤≥∞⋅·*/^(){}\[\],.:;'"`“”‘’|_\s\u200b]+$/);
  if (!match) return "";

  const raw = match[0];
  let lastStrongMathStart = -1;
  for (let index = 0; index < raw.length; index += 1) {
    const currentChar = raw[index];
    const previousChar = raw[index - 1] ?? "";
    if (
      /[∑√∫∞≤≥\[\({\-−0-9]/.test(currentChar) &&
      (index === 0 || /[\s:：,，]/.test(previousChar))
    ) {
      lastStrongMathStart = index;
    }
  }
  const candidate = raw.slice(lastStrongMathStart >= 0 ? lastStrongMathStart : 0);
  return isLikelyMathNoiseChunk(candidate) ? candidate : "";
}

function extractLeadingMathNoise(suffix: string) {
  const match = suffix.match(/^[0-9A-Za-z+\-−=<>≤≥∞⋅·*/^(){}\[\],.:;'"`“”‘’|_\s\u200b]+/);
  if (!match) return "";
  const candidate = match[0];
  return isLikelyMathNoiseChunk(candidate) ? candidate : "";
}

function startsWithRelationCommand(latex: string) {
  return RELATION_COMMAND_START_PATTERN.test(latex.trim());
}

function normalizeLatexPrefix(prefix: string) {
  return prefix
    .replace(/−/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function derivePrefixFromNoise(noise: string) {
  const match = noise.match(/([−-]?\d+(?:\.\d+)?|[A-Za-z])\s*[≤<≥>]/);
  return normalizeLatexPrefix(match?.[1] ?? "");
}

function maybeAugmentRelationLatex(latex: string, leftNoise: string, rightNoise: string) {
  if (!startsWithRelationCommand(latex)) {
    return latex;
  }

  const prefix = derivePrefixFromNoise(rightNoise) || derivePrefixFromNoise(leftNoise);
  if (!prefix) {
    return latex;
  }

  const normalizedLatex = latex.trim();
  return `${prefix} ${normalizedLatex}`;
}

function shouldStripAdjacentMathEcho(noise: string, latex: string) {
  if (!isLikelyMathNoiseChunk(noise)) {
    return false;
  }

  const normalizedLatex = latex.trim();
  if (
    STRUCTURED_RAW_TEX_START_PATTERN.test(normalizedLatex) ||
    startsWithRelationCommand(normalizedLatex)
  ) {
    return true;
  }

  return false;
}

function stripAdjacentMathTagEchoes(text: string) {
  const leadingEchoPattern =
    /([0-9A-Za-z+\-−=<>≤≥∞∑√∫⋅·*/^(){}\[\],._]+)(<math-(?:inline|display)\b[^>]*data-latex=(['"])([\s\S]*?)\3[^>]*><\/math-(?:inline|display)>)/gi;
  const trailingEchoPattern =
    /(<math-(?:inline|display)\b[^>]*data-latex=(['"])([\s\S]*?)\2[^>]*><\/math-(?:inline|display)>)([0-9A-Za-z+\-−=<>≤≥∞∑√∫⋅·*/^(){}\[\],._\u200b]+)/gi;

  const withoutLeadingEchoes = text.replace(
    leadingEchoPattern,
    (match, noise: string, tag: string, _quote: string, latex: string) =>
      shouldStripAdjacentMathEcho(noise, latex) ? tag : match,
  );

  return withoutLeadingEchoes.replace(
    trailingEchoPattern,
    (match, tag: string, _quote: string, latex: string, noise: string) =>
      shouldStripAdjacentMathEcho(noise, latex) ? tag : match,
  );
}

function findLatexExpressionEnd(text: string, start: number) {
  let index = start;
  let lastNonWhitespace = start;
  let curlyDepth = 0;
  let squareDepth = 0;
  let roundDepth = 0;

  while (index < text.length) {
    const currentChar = text[index];

    if (currentChar === "\\") {
      index += 1;
      while (index < text.length && /[A-Za-z]/.test(text[index])) {
        index += 1;
      }
      lastNonWhitespace = index;
      continue;
    }

    if (!/[A-Za-z0-9{}[\]()_^=+\-*/.,:;<>|'\s]/.test(currentChar)) {
      break;
    }

    if (currentChar === "{") curlyDepth += 1;
    if (currentChar === "}") curlyDepth = Math.max(0, curlyDepth - 1);
    if (currentChar === "[") squareDepth += 1;
    if (currentChar === "]") squareDepth = Math.max(0, squareDepth - 1);
    if (currentChar === "(") roundDepth += 1;
    if (currentChar === ")") roundDepth = Math.max(0, roundDepth - 1);

    index += 1;

    if (!/\s/.test(currentChar)) {
      lastNonWhitespace = index;
    }

    if (
      curlyDepth === 0 &&
      squareDepth === 0 &&
      roundDepth === 0 &&
      (/^[A-Za-z]\s*=\s*\d/.test(text.slice(index)) ||
        /[∑√∫∞≤≥]/.test(text[index] ?? "") ||
        /[。；;！？!?]/.test(text[index] ?? ""))
    ) {
      break;
    }
  }

  return lastNonWhitespace;
}

function findRenderableLatexPrefix(rawCandidate: string, displayMode: boolean) {
  const leadingWhitespace = rawCandidate.match(/^\s*/)?.[0].length ?? 0;
  const candidate = rawCandidate.slice(leadingWhitespace).replace(/\s+$/g, "");
  if (!candidate) {
    return { latex: "", consumedLength: 0 };
  }

  const endPositions: number[] = [];
  let curlyDepth = 0;
  let squareDepth = 0;
  let roundDepth = 0;

  for (let index = 0; index < candidate.length; index += 1) {
    const currentChar = candidate[index];
    if (currentChar === "{") curlyDepth += 1;
    if (currentChar === "}") curlyDepth = Math.max(0, curlyDepth - 1);
    if (currentChar === "[") squareDepth += 1;
    if (currentChar === "]") squareDepth = Math.max(0, squareDepth - 1);
    if (currentChar === "(") roundDepth += 1;
    if (currentChar === ")") roundDepth = Math.max(0, roundDepth - 1);

    if (
      curlyDepth === 0 &&
      squareDepth === 0 &&
      roundDepth === 0 &&
      !/\s/.test(currentChar)
    ) {
      const nextChar = candidate[index + 1] ?? "";
      if (!nextChar || /[\s.,;:!?]/.test(nextChar)) {
        endPositions.push(index + 1);
      }
    }
  }

  if (endPositions.length === 0) {
    endPositions.push(candidate.length);
  }

  for (let index = endPositions.length - 1; index >= 0; index -= 1) {
    const prefixEnd = endPositions[index] ?? candidate.length;
    const rawPrefix = candidate.slice(0, prefixEnd).trim();
    const trailingPunctuationLength =
      rawPrefix.match(/[.,;:!?]+$/)?.[0].length ?? 0;
    const prefix = rawPrefix.replace(/[.,;:!?]+$/g, "").trim();

    if (
      !prefix ||
      !isHighConfidenceBareMathSegment(prefix) ||
      hasLikelyProseTail(prefix)
    ) {
      continue;
    }

    if (canRenderLatex(prefix, displayMode)) {
      return {
        latex: prefix,
        consumedLength: leadingWhitespace + prefixEnd - trailingPunctuationLength,
      };
    }
  }

  return { latex: "", consumedLength: 0 };
}

function normalizeDuplicatedRawLatexClusters(text: string) {
  if (!text || !KNOWN_TEX_COMMAND_PATTERN.test(text)) {
    return text;
  }

  RAW_TEX_START_PATTERN.lastIndex = 0;
  let cursor = 0;
  let normalized = "";
  let match: RegExpExecArray | null = null;

  while ((match = RAW_TEX_START_PATTERN.exec(text))) {
    const start = match.index;
    if (start < cursor) {
      continue;
    }

    const end = findLatexExpressionEnd(text, start);
    if (end <= start) {
      continue;
    }

    const matchedCommand = match[0];
    const isSimpleSymbolCommand =
      /^\\(?:pm|mp|times|div|cdot|leq|geq|neq|approx|equiv|sim|propto|perp|parallel|infty|nabla|ell|emptyset|forall|exists|bullet|circ|star|dagger|angle|triangle|square|diamond|neg|cup|cap|to|mapsto|rightarrow|leftarrow|Rightarrow|Leftarrow)$/.test(matchedCommand);

    const symbolEnd = isSimpleSymbolCommand ? start + matchedCommand.length : end;
    const rawCandidateSlice = text.slice(start, isSimpleSymbolCommand ? symbolEnd : end);
    const initialCandidateLatex = rawCandidateSlice.trim();
    const displayMode = /\\displaystyle/.test(initialCandidateLatex);
    const hasStructuredRawLatex = STRUCTURED_RAW_TEX_START_PATTERN.test(initialCandidateLatex);
    const resolvedCandidate = hasStructuredRawLatex
      ? findRenderableLatexPrefix(rawCandidateSlice, displayMode)
      : { latex: initialCandidateLatex, consumedLength: rawCandidateSlice.trimEnd().length };

    const candidateLatex = resolvedCandidate.latex.trim();
    const candidateEnd =
      hasStructuredRawLatex && resolvedCandidate.consumedLength > 0
        ? start + resolvedCandidate.consumedLength
        : symbolEnd;

    if (!candidateLatex) {
      continue;
    }

    const prefix = text.slice(cursor, start);
    const leftNoise = extractTrailingMathNoise(prefix);
    const suffix = text.slice(candidateEnd);
    const rightNoise = extractLeadingMathNoise(suffix);
    const augmentedLatex = maybeAugmentRelationLatex(candidateLatex, leftNoise, rightNoise);
    const renderSucceeded = canRenderLatex(augmentedLatex, displayMode);
    const renderedComparable = renderSucceeded
      ? renderLatexToComparableText(augmentedLatex, displayMode)
      : "";
    const shouldStripLeftNoise = renderSucceeded && overlapsRenderedMath(leftNoise, renderedComparable);
    const shouldStripRightNoise =
      renderSucceeded &&
      (overlapsRenderedMath(rightNoise, renderedComparable) ||
        augmentedLatex !== candidateLatex);
    const shouldCollapse =
      renderSucceeded &&
      (hasStructuredRawLatex ||
        isSimpleSymbolCommand ||
        shouldStripLeftNoise ||
        shouldStripRightNoise ||
        augmentedLatex !== candidateLatex);

    if (!shouldCollapse) {
      continue;
    }

    const safePrefix = shouldStripLeftNoise
      ? prefix.slice(0, prefix.length - leftNoise.length)
      : prefix;
    normalized += safePrefix;
    normalized += createMathTag(augmentedLatex, displayMode);
    cursor = candidateEnd + (shouldStripRightNoise ? rightNoise.length : 0);
    RAW_TEX_START_PATTERN.lastIndex = cursor;
  }

  normalized += text.slice(cursor);
  return normalized;
}

function isHighConfidenceBareMathSegment(value: string) {
  const normalized = normalizeLatexAttribute(value);
  if (!normalized || !KNOWN_TEX_COMMAND_PATTERN.test(normalized)) {
    return false;
  }
  if (containsHtmlTagLikeMarkup(normalized) || /[\u4e00-\u9fff]/.test(normalized)) {
    return false;
  }

  const stripped = normalized
    .replace(KNOWN_TEX_COMMAND_GLOBAL, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}[\]]/g, "")
    .trim();

  if (!stripped) {
    return true;
  }
  if (!MATH_NOISE_PATTERN.test(stripped)) {
    return false;
  }

  const longWords = stripped.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    ["sin", "cos", "tan", "log", "ln", "lim", "max", "min"].includes(word.toLowerCase()),
  );
}

function hasLikelyProseTail(value: string) {
  const normalized = normalizeLatexAttribute(value);
  if (!normalized) return false;

  if (/[.,;:!?]\s+[A-Za-z\u4e00-\u9fff]/.test(normalized)) {
    return true;
  }

  return /\s+(?:if|then|when|where|because|thus|therefore|given|let|which|that|with|from|into|onto|after|before|since|while|for|and|or|but|is|are|was|were|be|been|being)\b/i.test(
    normalized,
  );
}

function normalizeStandaloneBareMathLine(segment: string) {
  if (!segment.trim() || containsHtmlTagLikeMarkup(segment)) {
    return segment;
  }

  const match = segment.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return segment;

  const [, leadingWhitespace, core, trailingWhitespace] = match;
  if (hasRiskyPlainTextMathPattern(core) || isLikelyCodeLikeLine(core)) {
    return segment;
  }
  if (!isHighConfidenceBareMathSegment(core)) {
    return segment;
  }

  return `${leadingWhitespace}${createMathTag(core, /\\displaystyle/.test(core))}${trailingWhitespace}`;
}

function normalizeStandaloneStructuredRawLatexSegment(segment: string) {
  if (!segment.trim() || containsHtmlTagLikeMarkup(segment)) {
    return segment;
  }

  const match = segment.match(/^(\s*)(\\(?:displaystyle|sum|prod|frac|dfrac|tfrac|cfrac|int|iint|iiint|oint|sqrt|lim|binom|dbinom|tbinom)\b[\s\S]*?)(\s*)$/);
  if (!match) {
    return segment;
  }

  const [, leadingWhitespace, rawLatex, trailingWhitespace] = match;
  const normalizedLatex = repairExplicitMathLatex(rawLatex.trim());
  if (!normalizedLatex || hasLikelyProseTail(normalizedLatex)) {
    return segment;
  }

  const displayMode = /\\displaystyle/.test(normalizedLatex);
  if (!canRenderLatex(normalizedLatex, displayMode)) {
    return segment;
  }

  return `${leadingWhitespace}${createMathTag(normalizedLatex, displayMode)}${trailingWhitespace}`;
}

function normalizeLikelyMathSuffixes(text: string) {
  const patterns = [
    /([:：]\s*)([^\n。；;！？!?]+)/g,
    /((?:为|是|得)\s*)([^\n。；;！？!?]+)/g,
  ];

  return patterns.reduce((currentText, pattern) => {
    return currentText.replace(pattern, (match, prefix: string, candidate: string) => {
      if (containsHtmlTagLikeMarkup(candidate)) return match;
      const leadingWhitespace = candidate.match(/^\s*/)?.[0] ?? "";
      const trailingWhitespace = candidate.match(/\s*$/)?.[0] ?? "";
      const trimmed = candidate.trim();
      if (!isHighConfidenceBareMathSegment(trimmed)) {
        return match;
      }

      return `${prefix}${leadingWhitespace}${createMathTag(trimmed, false)}${trailingWhitespace}`;
    });
  }, text);
}

function isLikelyMathContinuationTail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "!" || trimmed === "\\cdots" || trimmed === "..." || trimmed === "⋯") {
    return true;
  }
  if (containsHtmlTagLikeMarkup(trimmed) || /[\u4e00-\u9fff]/.test(trimmed)) {
    return false;
  }
  if (
    !/[0-9A-Za-z()]/.test(trimmed) ||
    (
      !/[=^_!\/∑∏ΣΠ∞π·⋯+\-−]/.test(trimmed) &&
      !/\.\.\./.test(trimmed)
    )
  ) {
    return false;
  }

  const longWords = trimmed.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    ["sin", "cos", "tan", "log", "ln", "lim", "exp", "max", "min"].includes(
      word.toLowerCase(),
    ),
  );
}

function extractLeadingMathContinuation(value: string) {
  const source = value ?? "";
  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
  const trimmedStart = source.slice(leadingWhitespace.length);
  const boundaries = [
    /\s+\b(?:for|if|when|where|because|thus|therefore|while|since|What|Which|That|This|is|are|was|were|converges|diverges)\b/,
    /[?;\n]/,
  ];
  let boundary = trimmedStart.length;

  boundaries.forEach((pattern) => {
    const match = trimmedStart.match(pattern);
    if (match && typeof match.index === "number") {
      boundary = Math.min(boundary, match.index);
    }
  });

  const candidate = trimmedStart
    .slice(0, boundary)
    .replace(/\s+$/g, "")
    .replace(/(?<!\.)\.(?!\.)$/g, "");
  const remainder = trimmedStart.slice(boundary);

  return {
    leadingWhitespace,
    candidate,
    remainder,
  };
}

function shouldMergeAdjacentInlineMathTags(leftLatex: string, rightLatex: string) {
  const left = normalizeLatexAttribute(leftLatex);
  const right = normalizeLatexAttribute(rightLatex);
  if (!left || !right) return false;

  if (/^(?:[=+\-−]|\\(?:geq|leq|neq|approx|cdot|to)\b)/.test(right)) {
    return true;
  }

  if (!/[=^_!\/∑∏ΣΠ∞π·\\]/.test(right) && !/\.\.\.|\\cdots/.test(right)) {
    return false;
  }

  const longWords = right.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    ["sin", "cos", "tan", "log", "ln", "lim", "exp", "max", "min"].includes(
      word.toLowerCase(),
    ),
  );
}

function mergeAdjacentMathTagFragments(text: string) {
  if (!text.includes("<math-inline")) {
    return text;
  }

  let current = text;
  let changed = false;

  do {
    changed = false;
    current = current.replace(
      /<math-inline\b[^>]*data-latex=(['"])([\s\S]*?)\1[^>]*><\/math-inline>(\s*)<math-inline\b[^>]*data-latex=(['"])([\s\S]*?)\4[^>]*><\/math-inline>/gi,
      (match, _leftQuote: string, leftLatex: string, whitespace: string, _rightQuote: string, rightLatex: string) => {
        if (!shouldMergeAdjacentInlineMathTags(leftLatex, rightLatex)) {
          return match;
        }

        changed = true;
        const mergedWhitespace = whitespace.includes("\n") ? whitespace : " ";
        return createMathTag(
          `${normalizeLatexAttribute(leftLatex)}${mergedWhitespace}${normalizeLatexAttribute(rightLatex)}`,
          false,
        );
      },
    );
    current = current.replace(
      /<math-inline\b[^>]*data-latex=(['"])([\s\S]*?)\1[^>]*><\/math-inline>([^<]+)/gi,
      (match, _quote: string, latex: string, trailingText: string) => {
        const normalizedLatex = normalizeLatexAttribute(latex);

        if (/^\s*=/.test(trailingText)) {
          const relationTail = trailingText.replace(/^\s*=\s*/, "");
          const { candidate, remainder } =
            extractLeadingMathContinuation(relationTail);
          if (candidate && isLikelyMathContinuationTail(candidate)) {
            changed = true;
            return (
              createMathTag(
                `${normalizedLatex} = ${normalizePlainTextMathLatex(candidate)}`,
                false,
              ) + remainder
            );
          }
        }

        const { candidate, remainder } = extractLeadingMathContinuation(
          trailingText,
        );
        if (candidate && isLikelyMathContinuationTail(candidate)) {
          changed = true;
          return (
            createMathTag(
              `${normalizedLatex} ${normalizePlainTextMathLatex(candidate)}`,
              false,
            ) + remainder
          );
        }

        return match;
      },
    );
  } while (changed);

  return current;
}

/**
 * Detect and wrap bare subscript/superscript expressions like x_1, CO_2, x^2, a_{n+1}
 * that appear outside of math delimiters. These are common in AP science/math content.
 */
function wrapBareSubscriptSuperscript(text: string): string {
  if (!text || containsHtmlTagLikeMarkup(text)) return text;

  // Pattern: letter(s) followed by _ or ^ with subscript/superscript content
  // Matches: x_1, CO_2, H_2O, a_n, x^2, e^{-x}, T_{n+1}, f'(x), etc.
  // Does NOT match inside existing math tags or HTML tags
  return text.replace(
    /(?<![<$\\])([A-Za-z][A-Za-z0-9]*(?:_(?:\{[^}]+\}|[A-Za-z0-9]+)|(\^)(?:\{[^}]+\}|[A-Za-z0-9]+))(?:_(?:\{[^}]+\}|[A-Za-z0-9]+)|(\^)(?:\{[^}]+\}|[A-Za-z0-9]+))*)/g,
    (_match, expr: string) => {
      // Skip if it looks like a normal word (no _ or ^)
      if (!/_/.test(expr) && !/\^/.test(expr)) return expr;
      // Skip common non-math patterns
      if (/^(?:data_|snake_case|__[a-z]|[a-z]+_[a-z]+_[a-z])/i.test(expr)) return expr;
      return createMathTag(expr, false);
    },
  );
}

export function createMathTag(latex: string, displayMode: boolean) {
  const escapedLatex = escapeHtml(repairExplicitMathLatex(latex));
  return displayMode
    ? `<math-display data-latex="${escapedLatex}"></math-display>`
    : `<math-inline data-latex="${escapedLatex}"></math-inline>`;
}

export function restoreMathTagMarkupToLatex(text: string) {
  if (!text) return text;

  return stripBrokenMathTagArtifacts(
    text
    .replace(
      /&lt;math-display\b[^>]*data-latex=(?:&quot;|&#39;)([\s\S]*?)(?:&quot;|&#39;)[^>]*&gt;(?:[\s\S]*?&lt;\/math-display&gt;)?/gi,
      (_match, latex: string) => `\n$$${normalizeLatexAttribute(latex)}$$\n`,
    )
    .replace(
      /&lt;math-inline\b[^>]*data-latex=(?:&quot;|&#39;)([\s\S]*?)(?:&quot;|&#39;)[^>]*&gt;(?:[\s\S]*?&lt;\/math-inline&gt;)?/gi,
      (_match, latex: string) => `$${normalizeLatexAttribute(latex)}$`,
    )
    .replace(
      /<math-display\b[^>]*data-latex=(['"])([\s\S]*?)\1[^>]*>(?:[\s\S]*?<\/math-display>)?/gi,
      (_match, _quote: string, latex: string) => `\n$$${normalizeLatexAttribute(latex)}$$\n`,
    )
    .replace(
      /<math-inline\b[^>]*data-latex=(['"])([\s\S]*?)\1[^>]*>(?:[\s\S]*?<\/math-inline>)?/gi,
      (_match, _quote: string, latex: string) => `$${normalizeLatexAttribute(latex)}$`,
    ),
  );
}

export function hasMathRenderFailure(text: string) {
  if (!text) return false;

  const normalizedText = normalizeMathText(
    normalizeEscapedInlineMathDelimiters(restoreMathTagMarkupToLatex(text)),
  );
  MATH_TAG_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MATH_TAG_PATTERN.exec(normalizedText)) !== null) {
    const displayMode = match[1] === "display";
    const latex = normalizeLatexAttribute(match[3] ?? "");
    if (!latex) continue;

    try {
      katex.renderToString(latex, {
        ...KATEX_RENDER_OPTIONS,
        displayMode,
        throwOnError: true,
      });
    } catch {
      return true;
    }
  }

  return false;
}

export function renderLatexToHtml(latex: string, displayMode: boolean) {
  const normalizedLatex = repairExplicitMathLatex(latex);
  if (!normalizedLatex) {
    return "";
  }

  try {
    return wrapRenderedMath(
      katex.renderToString(normalizedLatex, {
        ...KATEX_RENDER_OPTIONS,
        displayMode,
        output: "html" satisfies KatexDisplayOutput,
      }),
      displayMode,
    );
  } catch {
    return wrapRenderedMath(
      `<span class="doc-math-fallback">${escapeHtml(normalizedLatex)}</span>`,
      displayMode,
    );
  }
}

export function normalizeMathText(text: string) {
  if (!text) return text;

  const { text: protectedText, restore } = protectLikelyCodeLines(text);

  const normalizedEscapedDelimiters = normalizeSeriesKeywordTails(
    repairSplitDelimitedSumProductExpressions(
      repairBrokenInlineMathDelimiters(
        normalizeEscapedInlineMathDelimiters(
          restoreMathTagMarkupToLatex(protectedText),
        ),
      ),
    ),
  );
  const withCollapsedRawLatexFirst = normalizeStandaloneStructuredRawLatexLiteral(
    normalizeBareRawLatexOutsideExplicitSegments(normalizedEscapedDelimiters),
  );
  const withChemicalIsotopes = normalizeChemicalIsotopeSegments(
    withCollapsedRawLatexFirst,
  );
  const hasRiskyPlainText = hasRiskyPlainTextMathPattern(
    withChemicalIsotopes,
  );
  if (hasRiskyPlainText) {
    const riskyWithExplicitDisplay = withChemicalIsotopes.replace(
      DISPLAY_DELIMITER_PATTERN,
      (_match, dollarBlock: string, bracketBlock: string) =>
        createMathTag(dollarBlock ?? bracketBlock ?? "", true),
    );
    const riskyWithExplicitInline = riskyWithExplicitDisplay.replace(
      INLINE_DELIMITER_PATTERN,
      (_match, dollarInline: string, parenInline: string) =>
        createMathTag(dollarInline ?? parenInline ?? "", false),
    );
    const riskyWithStandaloneRawLatex = mapTextOutsideSkippedTags(
      mergeAdjacentMathTagFragments(riskyWithExplicitInline),
      (segment) =>
        segment
          .split(/(\n+)/)
          .map((part) =>
            part.includes("\n")
              ? part
              : normalizeStandaloneBareMathLine(
                  normalizeStandaloneStructuredRawLatexSegment(part),
                ),
          )
          .join(""),
    );
    return restore(
      stripAdjacentMathTagEchoes(
        riskyWithStandaloneRawLatex,
      ),
    );
  }

  const withPlainTextMath = normalizePlainTextMathSegments(
    withChemicalIsotopes,
  );
  const withExplicitDisplay = withPlainTextMath.replace(
    DISPLAY_DELIMITER_PATTERN,
    (_match, dollarBlock: string, bracketBlock: string) =>
      createMathTag(dollarBlock ?? bracketBlock ?? "", true),
  );
  const withExplicitInline = withExplicitDisplay.replace(
    INLINE_DELIMITER_PATTERN,
    (_match, dollarInline: string, parenInline: string) =>
      createMathTag(dollarInline ?? parenInline ?? "", false),
  );
  const withMergedFragments = mergeAdjacentMathTagFragments(withExplicitInline);
  const withCollapsedRawLatex = mapTextOutsideSkippedTags(
    withMergedFragments,
    normalizeDuplicatedRawLatexClusters,
  );
  const withBareSuffixes = mapTextOutsideSkippedTags(
    withCollapsedRawLatex,
    normalizeLikelyMathSuffixes,
  );
  const withBareSubscripts = mapTextOutsideSkippedTags(
    withBareSuffixes,
    wrapBareSubscriptSuperscript,
  );

  return restore(
    stripAdjacentMathTagEchoes(
      mergeAdjacentMathTagFragments(
        mapTextOutsideSkippedTags(withBareSubscripts, (segment) =>
          segment
            .split(/(\n+)/)
            .map((part) =>
              part.includes("\n")
                ? part
                : normalizeStandaloneBareMathLine(
                    normalizeStandaloneStructuredRawLatexSegment(part),
                  ),
            )
            .join(""),
        ),
      ),
    ),
  );
}

export function normalizeMathHtml(html: string) {
  if (!html.trim()) return "";
  return mapTextOutsideSkippedTags(html, normalizeMathText);
}

export function expandHtmlMathMarkup(html: string) {
  return html
    .replace(
      /<math-display\b[^>]*data-latex=(['"])([\s\S]*?)\1[^>]*>(?:[\s\S]*?<\/math-display>)?/gi,
      (_match, _quote: string, latex: string) => renderLatexToHtml(latex, true),
    )
    .replace(
      /<math-inline\b[^>]*data-latex=(['"])([\s\S]*?)\1[^>]*>(?:[\s\S]*?<\/math-inline>)?/gi,
      (_match, _quote: string, latex: string) => renderLatexToHtml(latex, false),
    );
}
