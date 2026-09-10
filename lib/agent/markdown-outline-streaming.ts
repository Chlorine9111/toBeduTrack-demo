import {
  DEFAULT_DOCUMENT_LAYOUT,
  type DocumentBlock,
  type DocumentKind,
  type DocumentModel,
} from "@/lib/doc-engine/block-types";

export type StreamingOutlineNodeStatus = "pending" | "streaming" | "complete";

export type StreamingOutlineNode = {
  id: string;
  title: string;
  status: StreamingOutlineNodeStatus;
  content: string;
  nodeKind?: string;
};

export type MarkdownOutlineProjectorState = {
  kind: "markdown-outline";
  title: string;
  summary?: string;
  previewText?: string;
  nodes: StreamingOutlineNode[];
};

type StreamingOutlineNodePatch = Partial<StreamingOutlineNode> &
  Pick<StreamingOutlineNode, "id">;

type MarkdownOutlineProjectorStatePatch = {
  title?: string;
  summary?: string;
  previewText?: string;
  nodes?: StreamingOutlineNodePatch[];
};

type ParsedPreludeNode = {
  id: string;
  title: string;
  nodeKind?: string;
};

type ParsedPrelude = {
  title?: string;
  nodes: ParsedPreludeNode[];
  bodyText: string;
};

type ParsedMarkdownSection = {
  id: string;
  title: string;
  body: string;
};

const STREAMING_PLACEHOLDER_TEXT = "_正在生成这一部分..._";

export const STREAMING_OUTLINE_START_MARKER = "<STREAMING_OUTLINE>";
export const STREAMING_OUTLINE_END_MARKER = "</STREAMING_OUTLINE>";

export const STREAMING_OUTLINE_PROTOCOL_PROMPT = [
  "输出时先给出仅供流式预览使用的结构声明块，严格使用以下格式：",
  "<STREAMING_OUTLINE>",
  "TITLE: 你决定的标题",
  "NODE: 你决定的顶层节点 1",
  "NODE: 你决定的顶层节点 2",
  "NODE: 你决定的顶层节点 3",
  "</STREAMING_OUTLINE>",
  "声明块结束后，再输出正式 Markdown 正文。",
  "正式正文必须使用同一个 # 标题，并按相同顺序展开对应的 ## 顶层节点。",
  "NODE 标题和数量都由你决定，不要套固定模板，也不要为了迎合系统去凑板块。",
].join("\n");

function normalizeText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2003]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugifyNodeTitle(title: string, index: number) {
  const slug = title
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=\[\]{};:'"\\|,<.>/?]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `node-${index + 1}-${slug}` : `node-${index + 1}`;
}

function parsePreludeNode(line: string, index: number): ParsedPreludeNode | null {
  const match = line.match(/^NODE(?:\|([^:]+))?:\s*(.+)$/i);
  if (!match) return null;

  const metadata = match[1]?.trim() ?? "";
  const title = match[2]?.trim() ?? "";
  if (!title) return null;

  const node: ParsedPreludeNode = {
    id: `node-${index + 1}`,
    title,
  };

  if (!metadata) {
    return node;
  }

  for (const segment of metadata.split("|")) {
    const [rawKey, ...rest] = segment.split("=");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (!key || !value) continue;
    if (key === "id") {
      node.id = value;
      continue;
    }
    if (key === "kind") {
      node.nodeKind = value;
    }
  }

  return node;
}

function splitPreludeAndBody(streamText: string): ParsedPrelude {
  const normalized = streamText.replace(/\r\n?/g, "\n").replace(/[\u00a0\u2003]/g, " ");
  const startIndex = normalized.indexOf(STREAMING_OUTLINE_START_MARKER);
  if (startIndex < 0) {
    return {
      nodes: [],
      bodyText: normalizeText(normalized),
    };
  }

  const afterStart = normalized.slice(
    startIndex + STREAMING_OUTLINE_START_MARKER.length,
  );
  const explicitEndIndex = afterStart.indexOf(STREAMING_OUTLINE_END_MARKER);
  const implicitBodyIndex =
    explicitEndIndex < 0 ? afterStart.search(/\n#\s+/) : -1;

  const preludeSource =
    explicitEndIndex >= 0
      ? afterStart.slice(0, explicitEndIndex)
      : implicitBodyIndex >= 0
        ? afterStart.slice(0, implicitBodyIndex)
        : afterStart;
  const bodySource =
    explicitEndIndex >= 0
      ? afterStart.slice(explicitEndIndex + STREAMING_OUTLINE_END_MARKER.length)
      : implicitBodyIndex >= 0
        ? afterStart.slice(implicitBodyIndex + 1)
        : "";

  const lines = preludeSource
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const nodes: ParsedPreludeNode[] = [];
  let title = "";

  for (const line of lines) {
    const titleMatch = line.match(/^TITLE:\s*(.+)$/i);
    if (titleMatch?.[1]?.trim()) {
      title = titleMatch[1].trim();
      continue;
    }

    const node = parsePreludeNode(line, nodes.length);
    if (node) {
      nodes.push(node);
    }
  }

  return {
    title: title || undefined,
    nodes,
    bodyText: normalizeText(bodySource),
  };
}

function parseMarkdownTitle(markdown: string, fallbackTitle: string) {
  const normalized = normalizeText(markdown);
  const titleMatch = normalized.match(/^#\s+(.+)$/m);
  return titleMatch?.[1]?.trim() || fallbackTitle;
}

function splitMarkdownSections(markdown: string) {
  const normalized = normalizeText(markdown);
  if (!normalized) return [] as ParsedMarkdownSection[];

  const matches = Array.from(normalized.matchAll(/^##\s+(.+)$/gm));
  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return {
      id: `node-${index + 1}`,
      title: match[1].trim(),
      body: normalized.slice(bodyStart, end).trim(),
    };
  });
}

function createHeaderBlock(title: string, eyebrow: string): DocumentBlock {
  return {
    id: "header",
    type: "header",
    data: {
      title,
      eyebrow,
    },
  };
}

function createSectionTitleBlock(node: Pick<StreamingOutlineNode, "id" | "title">): DocumentBlock {
  return {
    id: `${node.id}-title`,
    type: "section-title",
    data: {
      title: node.title,
    },
  };
}

function createSectionBodyBlock(node: Pick<StreamingOutlineNode, "id" | "content">): DocumentBlock {
  return {
    id: `${node.id}-body`,
    type: "instruction",
    data: {
      text: node.content || STREAMING_PLACEHOLDER_TEXT,
    },
  };
}

function resolveDocumentEyebrow(
  documentType: DocumentKind,
  explicitEyebrow?: string,
) {
  if (explicitEyebrow?.trim()) {
    return explicitEyebrow.trim();
  }

  switch (documentType) {
    case "lesson-plan":
      return "Lesson Plan";
    case "rubric":
      return "Rubric";
    case "exam":
      return "Exam";
    case "worksheet":
      return "Worksheet";
    case "exercises":
      return "Exercises";
    case "quiz":
      return "Quiz";
    default:
      return "Document";
  }
}

export function stripStreamingOutlinePrelude(streamText: string) {
  const normalized = streamText.replace(/\r\n?/g, "\n").replace(/[\u00a0\u2003]/g, " ");
  const startIndex = normalized.indexOf(STREAMING_OUTLINE_START_MARKER);
  if (startIndex < 0) {
    return normalizeText(normalized);
  }

  const before = normalized.slice(0, startIndex).trim();
  const afterStart = normalized.slice(
    startIndex + STREAMING_OUTLINE_START_MARKER.length,
  );
  const endIndex = afterStart.indexOf(STREAMING_OUTLINE_END_MARKER);
  const after =
    endIndex >= 0
      ? afterStart.slice(endIndex + STREAMING_OUTLINE_END_MARKER.length).trim()
      : "";

  return normalizeText([before, after].filter(Boolean).join("\n\n"));
}

export function createInitialMarkdownOutlineProjectorState(params?: {
  title?: string;
  summary?: string;
  previewText?: string;
}): MarkdownOutlineProjectorState {
  return {
    kind: "markdown-outline",
    title: params?.title?.trim() || "产物（生成中）",
    summary: params?.summary?.trim() || undefined,
    previewText: params?.previewText?.trim() || undefined,
    nodes: [],
  };
}

export function mergeMarkdownOutlineProjectorState(
  previous: MarkdownOutlineProjectorState | null,
  patch: MarkdownOutlineProjectorStatePatch,
): MarkdownOutlineProjectorState {
  const base = previous
    ? {
        ...previous,
        nodes: previous.nodes.map((node) => ({ ...node })),
      }
    : createInitialMarkdownOutlineProjectorState({
        title: patch.title,
        summary: patch.summary,
        previewText: patch.previewText,
      });

  if (typeof patch.title === "string" && patch.title.trim()) {
    base.title = patch.title.trim();
  }
  if (typeof patch.summary === "string") {
    base.summary = patch.summary.trim() || undefined;
  }
  if (typeof patch.previewText === "string") {
    base.previewText = patch.previewText.trim() || undefined;
  }

  if (!patch.nodes?.length) {
    return base;
  }

  patch.nodes.forEach((nodePatch) => {
    const index = base.nodes.findIndex((node) => node.id === nodePatch.id);
    const nextNode: StreamingOutlineNode = {
      id: nodePatch.id,
      title:
        typeof nodePatch.title === "string" && nodePatch.title.trim()
          ? nodePatch.title.trim()
          : `第 ${base.nodes.length + 1} 部分`,
      status: nodePatch.status ?? "pending",
      content: typeof nodePatch.content === "string" ? nodePatch.content : "",
      nodeKind:
        typeof nodePatch.nodeKind === "string" && nodePatch.nodeKind.trim()
          ? nodePatch.nodeKind.trim()
          : undefined,
    };

    if (index < 0) {
      base.nodes.push(nextNode);
      return;
    }

    const current = base.nodes[index];
    base.nodes[index] = {
      id: current.id,
      title:
        typeof nodePatch.title === "string" && nodePatch.title.trim()
          ? nodePatch.title.trim()
          : current.title,
      status: nodePatch.status ?? current.status,
      content:
        typeof nodePatch.content === "string"
          ? nodePatch.content
          : current.content,
      nodeKind:
        typeof nodePatch.nodeKind === "string" && nodePatch.nodeKind.trim()
          ? nodePatch.nodeKind.trim()
          : current.nodeKind,
    };
  });

  return base;
}

export function buildMarkdownOutlineProjectorMarkdown(
  state: MarkdownOutlineProjectorState,
  options?: { includePendingPlaceholders?: boolean },
) {
  const includePendingPlaceholders = options?.includePendingPlaceholders ?? true;
  const lines = [`# ${state.title || "产物（生成中）"}`, ""];

  if (state.nodes.length === 0) {
    if (includePendingPlaceholders) {
      lines.push(STREAMING_PLACEHOLDER_TEXT);
    }
    return normalizeText(lines.join("\n"));
  }

  state.nodes.forEach((node, index) => {
    lines.push(`## ${node.title}`);
    if (node.content.trim()) {
      lines.push(node.content.trim());
    } else if (includePendingPlaceholders) {
      lines.push(STREAMING_PLACEHOLDER_TEXT);
    }
    if (index < state.nodes.length - 1) {
      lines.push("");
    }
  });

  return normalizeText(lines.join("\n"));
}

export function buildMarkdownOutlineProjectorDocument(
  state: MarkdownOutlineProjectorState,
  options?: {
    documentType?: DocumentKind;
    eyebrow?: string;
  },
): DocumentModel {
  const documentType = options?.documentType ?? "notes";
  const eyebrow = resolveDocumentEyebrow(documentType, options?.eyebrow);
  const blocks: DocumentBlock[] = [
    createHeaderBlock(state.title || "产物（生成中）", eyebrow),
  ];

  state.nodes.forEach((node) => {
    blocks.push(createSectionTitleBlock(node));
    blocks.push(createSectionBodyBlock(node));
  });

  return {
    id: "markdown-outline-projector",
    type: documentType,
    title: state.title || "产物（生成中）",
    meta: {},
    blocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

export function extractMarkdownOutlineProjectorState(params: {
  streamText: string;
  fallbackTitle?: string;
  summary?: string;
  previewText?: string;
  complete?: boolean;
}): MarkdownOutlineProjectorState {
  const fallbackTitle = params.fallbackTitle?.trim() || "产物（生成中）";
  const parsedPrelude = splitPreludeAndBody(params.streamText);
  const markdownSections = splitMarkdownSections(parsedPrelude.bodyText);
  const markdownTitle = parseMarkdownTitle(parsedPrelude.bodyText, fallbackTitle);
  const title = parsedPrelude.title || markdownTitle || fallbackTitle;
  const outlineNodes = parsedPrelude.nodes.map((node, index) => ({
    id: node.id || slugifyNodeTitle(node.title, index),
    title: node.title,
    nodeKind: node.nodeKind,
  }));

  const mergedNodes = Array.from(
    { length: Math.max(outlineNodes.length, markdownSections.length) },
    (_, index) => {
      const outlineNode = outlineNodes[index];
      const markdownNode = markdownSections[index];
      const titleText =
        markdownNode?.title?.trim() || outlineNode?.title?.trim() || `第 ${index + 1} 部分`;
      return {
        id:
          outlineNode?.id ||
          markdownNode?.id ||
          slugifyNodeTitle(titleText, index),
        title: titleText,
        body: markdownNode?.body ?? "",
        nodeKind: outlineNode?.nodeKind,
      };
    },
  );

  const lastFilledIndex = mergedNodes.reduce((latestIndex, node, index) => {
    return node.body.trim() ? index : latestIndex;
  }, -1);

  return {
    kind: "markdown-outline",
    title,
    summary: params.summary?.trim() || undefined,
    previewText: params.previewText?.trim() || undefined,
    nodes: mergedNodes.map((node, index) => ({
      id: node.id,
      title: node.title,
      status:
        !node.body.trim()
          ? "pending"
          : params.complete || index < lastFilledIndex
            ? "complete"
            : "streaming",
      content: node.body,
      nodeKind: node.nodeKind,
    })),
  };
}

export function diffMarkdownOutlineProjectorState(
  previous: MarkdownOutlineProjectorState,
  next: MarkdownOutlineProjectorState,
) {
  const changedNodes = next.nodes.filter((node) => {
    const previousNode = previous.nodes.find((item) => item.id === node.id);
    return (
      !previousNode ||
      previousNode.title !== node.title ||
      previousNode.status !== node.status ||
      previousNode.content !== node.content ||
      previousNode.nodeKind !== node.nodeKind
    );
  });

  return {
    titleChanged: previous.title !== next.title,
    summaryChanged: previous.summary !== next.summary,
    previewTextChanged: previous.previewText !== next.previewText,
    changedNodes,
  };
}
