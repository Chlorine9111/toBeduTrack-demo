import {
  Mark,
  Node,
  nodeInputRule,
  nodePasteRule,
  type AnyExtension,
} from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { OrderedList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import {
  Ai,
  ExportDocx,
  type OnAiEventContext,
  type OnSuccessContext,
} from "@/lib/doc-engine/tiptap-pro-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { createElement } from "react";
import {
  DisplayMathNodeView,
  InlineMathNodeView,
  type MathNodeEditRequest,
} from "@/shared/doc-engine/TiptapMathNodeViews";

type TiptapProAuth = {
  appId: string;
  token: string;
  convertToken?: string | null;
};

type HtmlAttributesRecord = Record<string, unknown>;

const INLINE_MATH_INPUT_RULES = [
  /(?<!\$)\$([^\n$]+?)\$(?!\$)$/,
  /\\\(([\s\S]+?)\\\)$/,
];
const INLINE_MATH_PASTE_RULES = [
  /(?<!\$)\$([^\n$]+?)\$(?!\$)/g,
  /\\\(([\s\S]+?)\\\)/g,
];
const DISPLAY_MATH_INPUT_RULES = [
  /^\s*\$\$([\s\S]+?)\$\$\s*$/,
  /^\s*\\\[([\s\S]+?)\\\]\s*$/,
];
const DISPLAY_MATH_PASTE_RULES = [
  /\$\$([\s\S]+?)\$\$/g,
  /\\\[([\s\S]+?)\\\]/g,
];

function getMathAttributesFromMatch(match: RegExpMatchArray) {
  const latex = `${match[1] ?? ""}`.trim();
  return latex ? { latex } : false;
}

function createSectionNode() {
  return Node.create({
    name: "docSection",
    group: "block",
    content: "block+",
    defining: true,
    addAttributes() {
      return {
        section: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-section"),
          renderHTML: (attributes) =>
            attributes.section ? { "data-section": attributes.section } : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: "section[data-section]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["section", HTMLAttributes, 0];
    },
  });
}

function createQuestionNode() {
  return Node.create({
    name: "docQuestion",
    group: "block",
    content: "block+",
    defining: true,
    addAttributes() {
      return {
        question: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-question"),
          renderHTML: (attributes) =>
            attributes.question ? { "data-question": attributes.question } : {},
        },
        points: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-points"),
          renderHTML: (attributes) =>
            attributes.points ? { "data-points": attributes.points } : {},
        },
        difficulty: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-difficulty"),
          renderHTML: (attributes) =>
            attributes.difficulty ? { "data-difficulty": attributes.difficulty } : {},
        },
        instanceId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-instance-id"),
          renderHTML: (attributes) =>
            attributes.instanceId
              ? { "data-instance-id": attributes.instanceId }
              : {},
        },
        sourceExerciseId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-source-exercise-id"),
          renderHTML: (attributes) =>
            attributes.sourceExerciseId
              ? { "data-source-exercise-id": attributes.sourceExerciseId }
              : {},
        },
        questionType: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-question-type"),
          renderHTML: (attributes) =>
            attributes.questionType
              ? { "data-question-type": attributes.questionType }
              : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-question]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", HTMLAttributes, 0];
    },
  });
}

function createAnswerSpaceNode() {
  return Node.create({
    name: "docAnswerSpace",
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        size: {
          default: "medium",
          parseHTML: (element) => element.getAttribute("data-answer-space") || "medium",
          renderHTML: (attributes) => ({
            "data-answer-space": attributes.size || "medium",
          }),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-answer-space]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", HTMLAttributes];
    },
  });
}

// ── 修复 1: Table 扩展保留 data-rubric 属性 ─────────────
// 基于 Context7 文档: extend existing extension with custom attributes
const RubricTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rubric: {
        default: null,
        parseHTML: (element) =>
          element.hasAttribute("data-rubric") ? "true" : null,
        renderHTML: (attributes) =>
          attributes.rubric ? { "data-rubric": attributes.rubric } : {},
      },
    };
  },
});

// ── 修复 2: OrderedList 保留 data-options 和 type 属性 ───
// Skill prompt 输出 <ol data-options type="A">，需要保留这两个属性
const DocOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      options: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.hasAttribute("data-options") ? "true" : null,
        renderHTML: (attributes: HtmlAttributesRecord) =>
          attributes.options != null ? { "data-options": "" } : {},
      },
      listType: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("type"),
        renderHTML: (attributes: HtmlAttributesRecord) => {
          const listType =
            typeof attributes.listType === "string" ? attributes.listType : null;
          return listType ? { type: listType } : {};
        },
      },
    };
  },
});

const DocPageBreak = Node.create({
  name: "docPageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  parseHTML() {
    return [{ tag: "hr[data-page-break]" }];
  },
  renderHTML() {
    return ["hr", { "data-page-break": "true" }];
  },
});

// ── 修复 3: Subscript / Superscript marks ────────────────
// 学术文档常用：H₂O, x², 脚注标记等
// 基于 Context7 文档: create custom Mark
const Subscript = Mark.create({
  name: "subscript",
  parseHTML() {
    return [{ tag: "sub" }];
  },
  renderHTML() {
    return ["sub", 0];
  },
});

const Superscript = Mark.create({
  name: "superscript",
  parseHTML() {
    return [{ tag: "sup" }];
  },
  renderHTML() {
    return ["sup", 0];
  },
});

function createInlineMathNode(onRequestMathEdit?: (request: MathNodeEditRequest) => void) {
  return Node.create({
    name: "docInlineMath",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        latex: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-latex") ?? "",
          renderHTML: (attributes) =>
            attributes.latex ? { "data-latex": attributes.latex } : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: "math-inline[data-latex]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["math-inline", HTMLAttributes];
    },
    addInputRules() {
      return INLINE_MATH_INPUT_RULES.map((find) =>
        nodeInputRule({
          find,
          type: this.type,
          getAttributes: getMathAttributesFromMatch,
        }),
      );
    },
    addPasteRules() {
      return INLINE_MATH_PASTE_RULES.map((find) =>
        nodePasteRule({
          find,
          type: this.type,
          getAttributes: getMathAttributesFromMatch,
        }),
      );
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) =>
        createElement(InlineMathNodeView, {
          ...props,
          onRequestMathEdit,
        }),
      );
    },
  });
}

function createDisplayMathNode(onRequestMathEdit?: (request: MathNodeEditRequest) => void) {
  return Node.create({
    name: "docDisplayMath",
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        latex: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-latex") ?? "",
          renderHTML: (attributes) =>
            attributes.latex ? { "data-latex": attributes.latex } : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: "math-display[data-latex]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["math-display", HTMLAttributes];
    },
    addInputRules() {
      return DISPLAY_MATH_INPUT_RULES.map((find) =>
        nodeInputRule({
          find,
          type: this.type,
          getAttributes: getMathAttributesFromMatch,
        }),
      );
    },
    addPasteRules() {
      return DISPLAY_MATH_PASTE_RULES.map((find) =>
        nodePasteRule({
          find,
          type: this.type,
          getAttributes: getMathAttributesFromMatch,
        }),
      );
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) =>
        createElement(DisplayMathNodeView, {
          ...props,
          onRequestMathEdit,
        }),
      );
    },
  });
}

export function createDocEditorExtensions(params: {
  placeholderText: string;
  documentType: string;
  proAuth?: TiptapProAuth | null;
  onRequestMathEdit?: (request: MathNodeEditRequest) => void;
  onAiLoading?: (context: OnAiEventContext) => void;
  onAiSuccess?: (context: OnSuccessContext) => void;
  onAiError?: (error: Error, context: OnAiEventContext) => void;
}) {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false,
      // 禁用内置 orderedList，用自定义的 DocOrderedList 代替
      orderedList: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      },
    }),
    createSectionNode(),
    createQuestionNode(),
    createAnswerSpaceNode(),
    // 用扩展版替换原始 Table（保留 data-rubric）
    RubricTable.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    // 用扩展版替换原始 OrderedList（保留 data-options + type）
    DocOrderedList,
    DocPageBreak,
    // 学术文档必备的上下标
    Subscript,
    Superscript,
    createDisplayMathNode(params.onRequestMathEdit),
    createInlineMathNode(params.onRequestMathEdit),
    Highlight.configure({
      multicolor: true,
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Placeholder.configure({
      placeholder: params.placeholderText,
    }),
  ];

  if (params.proAuth?.appId && params.proAuth.token) {
    extensions.push(
      Ai.configure({
        appId: params.proAuth.appId,
        token: params.proAuth.token,
        autocompletion: false,
        showDecorations: true,
        hideDecorationsOnStreamEnd: false,
        onLoading: params.onAiLoading,
        onSuccess: params.onAiSuccess,
        onError: params.onAiError,
      }),
    );
    extensions.push(
      ExportDocx.configure({
        exportType: "blob",
        onCompleteExport: () => undefined,
        pageMargins: {
          top: "1.4cm",
          right: "1.4cm",
          bottom: "1.4cm",
          left: "1.4cm",
        },
        pageSize:
          params.documentType === "rubric"
            ? {
                width: "29.7cm",
                height: "21cm",
              }
            : {
                width: "21cm",
                height: "29.7cm",
        },
      }),
    );
  }

  return extensions;
}
