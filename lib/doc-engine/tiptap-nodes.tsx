import { Node, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { DocumentBlock, DocumentModel } from "@/lib/doc-engine/block-types";
import {
  AnswerSpaceBlockNodeView,
  DividerBlockNodeView,
  HeaderBlockNodeView,
  InstructionBlockNodeView,
  LessonStepBlockNodeView,
  PageBreakBlockNodeView,
  QuestionBlockNodeView,
  RubricRowBlockNodeView,
  SectionTitleBlockNodeView,
  TableBlockNodeView,
} from "@/shared/doc-engine/DocNodeViews";

function createBlockNode(params: {
  name: string;
  component: Parameters<typeof ReactNodeViewRenderer>[0];
}) {
  return Node.create({
    name: params.name,
    group: "block",
    atom: true,
    selectable: false,
    draggable: false,
    addAttributes() {
      return {
        blockId: {
          default: "",
        },
        data: {
          default: {},
        },
      };
    },
    parseHTML() {
      return [{ tag: `div[data-doc-block-node="${params.name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        {
          ...HTMLAttributes,
          "data-doc-block-node": params.name,
        },
      ];
    },
    addNodeView() {
      return ReactNodeViewRenderer(params.component);
    },
  });
}

export const DOC_NODE_NAMES = {
  header: "docHeaderBlock",
  sectionTitle: "docSectionTitleBlock",
  instruction: "docInstructionBlock",
  question: "docQuestionBlock",
  rubricRow: "docRubricRowBlock",
  lessonStep: "docLessonStepBlock",
  divider: "docDividerBlock",
  answerSpace: "docAnswerSpaceBlock",
  table: "docTableBlock",
  pageBreak: "docPageBreakBlock",
} as const;

export function createDocEngineExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      paragraph: false,
      bold: false,
      italic: false,
      strike: false,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.header,
      component: HeaderBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.sectionTitle,
      component: SectionTitleBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.instruction,
      component: InstructionBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.question,
      component: QuestionBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.rubricRow,
      component: RubricRowBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.lessonStep,
      component: LessonStepBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.divider,
      component: DividerBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.answerSpace,
      component: AnswerSpaceBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.table,
      component: TableBlockNodeView,
    }),
    createBlockNode({
      name: DOC_NODE_NAMES.pageBreak,
      component: PageBreakBlockNodeView,
    }),
  ];
}

function resolveNodeName(block: DocumentBlock) {
  switch (block.type) {
    case "header":
      return DOC_NODE_NAMES.header;
    case "section-title":
      return DOC_NODE_NAMES.sectionTitle;
    case "instruction":
      return DOC_NODE_NAMES.instruction;
    case "question":
      return DOC_NODE_NAMES.question;
    case "rubric-row":
      return DOC_NODE_NAMES.rubricRow;
    case "lesson-step":
      return DOC_NODE_NAMES.lessonStep;
    case "divider":
      return DOC_NODE_NAMES.divider;
    case "answer-space":
      return DOC_NODE_NAMES.answerSpace;
    case "table":
      return DOC_NODE_NAMES.table;
    case "page-break":
      return DOC_NODE_NAMES.pageBreak;
    default:
      return DOC_NODE_NAMES.instruction;
  }
}

export function documentModelToTiptapContent(document: DocumentModel) {
  return {
    type: "doc",
    content: document.blocks.map((block) => ({
      type: resolveNodeName(block),
      attrs: {
        blockId: block.id,
        data: block.data,
      },
    })),
  };
}
