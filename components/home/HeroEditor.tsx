"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Send,
  Paperclip,
  Sparkles,
  FileText,
  ClipboardCheck,
  BookOpen,
  Download,
  MoreHorizontal,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  List,
  ListOrdered,
  WandSparkles,
  Check,
  RotateCcw,
  Loader2,
} from "lucide-react"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import UnderlineExt from "@tiptap/extension-underline"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableHeader from "@tiptap/extension-table-header"
import TableCell from "@tiptap/extension-table-cell"
import TextAlign from "@tiptap/extension-text-align"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import { Button, Card } from "@heroui/react"
import { cn } from "@/lib/utils"
import "@/lib/doc-engine/academic-print.css"

// ── Demo editor CSS overrides (tighter spacing for landing page) ──
const DEMO_EDITOR_STYLES = `
.demo-editor [data-doc-type] li > p {
  margin: 0;
}
.demo-editor [data-doc-type] ol[type="A"],
.demo-editor [data-doc-type] ol[data-options] {
  margin: 0.15rem 0 0.35rem;
  padding-left: 2rem;
}
.demo-editor [data-doc-type] ol[type="A"] li,
.demo-editor [data-doc-type] ol[data-options] li {
  margin: 0;
  padding-left: 0.25rem;
  line-height: 1.45;
}
.demo-editor [data-doc-type] h1 {
  font-size: 1.25rem;
  margin-bottom: 0.15rem;
}
.demo-editor [data-doc-type] h1 + p {
  text-align: center;
  color: #555;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.demo-editor [data-doc-type] p {
  margin: 0.25rem 0;
}
.demo-editor [data-doc-type] hr {
  margin: 0.65rem 0;
}
.demo-editor [data-doc-type] section[data-question] {
  margin: 0.4rem 0;
}
.demo-editor [data-doc-type] blockquote {
  margin: 0.4rem 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}
.demo-editor [data-doc-type] table th,
.demo-editor [data-doc-type] table td {
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  line-height: 1.4;
}
.demo-editor [data-doc-type] table th {
  font-size: 0.75rem;
}
`

// ── Content type presets ──────────────────────────────────────────

type ContentType = "exercises" | "rubric" | "lesson-plan"

const CONTENT_OPTIONS: {
  id: ContentType
  label: string
  icon: typeof FileText
  prompt: string
  docType: string
}[] = [
  {
    id: "exercises",
    label: "Practice Questions",
    icon: FileText,
    prompt: "Generate practice questions for AP Calculus AB, Unit 5",
    docType: "worksheet",
  },
  {
    id: "rubric",
    label: "Rubric",
    icon: ClipboardCheck,
    prompt: "Create a rubric for AP Calculus AB problem sets",
    docType: "rubric",
  },
  {
    id: "lesson-plan",
    label: "Lesson Plan",
    icon: BookOpen,
    prompt: "Create a lesson plan for Mean Value Theorem",
    docType: "lesson-plan",
  },
]

// ── HTML content for each type ────────────────────────────────────

const EXERCISE_HTML = `
<h1>AP Calculus AB — Practice Questions</h1>
<p>Unit 5: Analytical Applications of Differentiation</p>
<hr>
<section data-question="1">
<p><strong>1.</strong> Let f(x) = 3x² − 4x + 1. What is the value of f′(2)?</p>
<ol type="A">
<li>8</li>
<li>5</li>
<li>12</li>
<li>6</li>
</ol>
<p><strong>Solution:</strong> Differentiate: f′(x) = 6x − 4. Substitute x = 2: f′(2) = 12 − 4 = <strong>8</strong>. Answer: <strong>A</strong></p>
</section>
<hr>
<section data-question="2">
<p><strong>2.</strong> If g(x) = x³ − 3x, find all critical points of g on the interval [−2, 2].</p>
<ol type="A">
<li>x = −1 and x = 1</li>
<li>x = 0 only</li>
<li>x = −1 only</li>
<li>x = ±√3</li>
</ol>
<p><strong>Solution:</strong> g′(x) = 3x² − 3 = 3(x² − 1) = 0 ⟹ x = ±1. Both are in [−2, 2]. Answer: <strong>A</strong></p>
</section>
`

const RUBRIC_HTML = `
<h1>AP Calculus AB — Problem Set Rubric</h1>
<p>Unit 5: Analytical Applications of Differentiation</p>
<table data-rubric="true">
<thead>
<tr>
<th>Dimension</th>
<th>Excellent (4)</th>
<th>Proficient (3)</th>
<th>Developing (2)</th>
<th>Beginning (1)</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Mathematical Reasoning</strong><br><em>Weight: 30%</em></td>
<td>Clearly states theorems and applies them with precise justification.</td>
<td>Identifies relevant theorems with minor gaps in justification.</td>
<td>Attempts to apply theorems but with significant logical gaps.</td>
<td>No clear mathematical reasoning or theorem application.</td>
</tr>
<tr>
<td><strong>Computational Accuracy</strong><br><em>Weight: 30%</em></td>
<td>All calculations are correct with proper notation throughout.</td>
<td>Minor arithmetic errors that do not affect the final answer.</td>
<td>Multiple errors that lead to an incorrect final answer.</td>
<td>Calculations are largely absent or incorrect.</td>
</tr>
<tr>
<td><strong>Communication</strong><br><em>Weight: 20%</em></td>
<td>Work is clearly organized with complete step-by-step solutions.</td>
<td>Organized but missing some intermediate steps.</td>
<td>Disorganized with unclear progression of ideas.</td>
<td>No discernible organization or explanation.</td>
</tr>
<tr>
<td><strong>Mathematical Notation</strong><br><em>Weight: 20%</em></td>
<td>Uses correct notation consistently (derivatives, integrals, limits).</td>
<td>Mostly correct notation with occasional informal shortcuts.</td>
<td>Frequent notation errors that obscure meaning.</td>
<td>No proper mathematical notation used.</td>
</tr>
</tbody>
</table>
`

const LESSON_PLAN_HTML = `
<h1>AP Calculus AB — Lesson Plan</h1>
<p><em>Applications of the Mean Value Theorem · 50 minutes</em></p>
<hr>
<h2>Section 1: Warm-Up — Review of Rolle's Theorem (8 min)</h2>
<p><strong>Activity:</strong> Students sketch a continuous function on [a, b] where f(a) = f(b) and identify where f′(c) = 0.</p>
<p><strong>Discussion:</strong> Connect Rolle's Theorem as a special case of MVT. Ask: what changes if f(a) ≠ f(b)?</p>
<hr>
<h2>Section 2: Direct Instruction — Mean Value Theorem (15 min)</h2>
<p><strong>Lecture:</strong> Present MVT statement. Walk through geometric interpretation: secant slope equals tangent slope at some interior point.</p>
<p><strong>Worked Example:</strong> f(x) = x³ − 3x on [0, 2]. Find c satisfying MVT.</p>
<blockquote><p>f′(c) = (f(2) − f(0)) / (2 − 0) = (2 − 0) / 2 = 1<br>3c² − 3 = 1 ⟹ c² = 4/3 ⟹ c = 2/√3 ≈ 1.15</p></blockquote>
<hr>
<h2>Section 3: Guided Practice & Exit Ticket (22 min)</h2>
<p><strong>Practice:</strong> Students work in pairs on 3 MVT problems of increasing difficulty. Teacher circulates.</p>
<p><strong>Exit Ticket:</strong> Given a table of values for f on [1, 5], determine whether MVT guarantees a point where f′(c) = 4. Justify your answer.</p>
`

const CONTENT_MAP: Record<ContentType, string> = {
  exercises: EXERCISE_HTML,
  rubric: RUBRIC_HTML,
  "lesson-plan": LESSON_PLAN_HTML,
}

const AI_REPLY_MAP: Record<ContentType, string> = {
  exercises:
    "Here are 2 practice questions for AP Calculus AB, Unit 5. You can edit them directly — select any text to use AI rewrite.",
  rubric:
    "I've created a 4-dimension rubric. You can edit any cell — select text and use AI to rewrite.",
  "lesson-plan":
    "Here's a 50-minute lesson plan on MVT. Select any text to edit with AI.",
}

// ── AI Edit presets (fallback) ────────────────────────────────────

const AI_EDIT_PRESETS: Record<string, string> = {
  "make it harder":
    "Determine all values of c on the open interval (0, 3) that satisfy the conclusion of the Mean Value Theorem for f(x) = 3x² − 4x + 1. Justify your answer using the theorem statement.",
  "make it easier":
    "What is 6 × 2 − 4?",
  "convert to frq":
    "Let f(x) = 3x² − 4x + 1. Show that f is differentiable on (0, 3). Find f′(2) and explain each step of your differentiation.",
  "simplify":
    "Find f′(2) if f(x) = 3x² − 4x + 1.",
  "add more detail":
    "Let f(x) = 3x² − 4x + 1. Using the power rule and sum rule of differentiation, find f′(x). Then evaluate f′(2). Show all steps clearly and verify your answer by computing the difference quotient limit.",
}

// ── Component ──────────────────────────────────────────────────────

export default function HeroEditor() {
  const [selectedType, setSelectedType] = useState<ContentType | null>(null)
  const [chatPhase, setChatPhase] = useState<
    "choosing" | "generating" | "done"
  >("choosing")
  const [aiReply, setAiReply] = useState("")

  // AI Edit state
  const [aiEditInstruction, setAiEditInstruction] = useState("")
  const [aiEditLoading, setAiEditLoading] = useState(false)
  const [aiEditResult, setAiEditResult] = useState("")
  const [showAiComposer, setShowAiComposer] = useState(false)
  const aiInputRef = useRef<HTMLInputElement>(null)

  // ── Tiptap Editor ──────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      UnderlineExt,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder: "Your generated content will appear here...",
      }),
    ],
    content: "",
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "ProseMirror min-h-[340px] px-6 py-6 outline-hidden text-[15px] leading-7",
        "data-doc-type": "worksheet",
      },
    },
  })

  // ── Handle content type selection ──────────────────────────────

  const handleSelectType = useCallback(
    (type: ContentType) => {
      setSelectedType(type)
      setChatPhase("generating")
      setAiReply("")
      setShowAiComposer(false)
      setAiEditResult("")

      setTimeout(() => {
        if (editor) {
          const opt = CONTENT_OPTIONS.find((o) => o.id === type)
          // Update data-doc-type attribute
          editor.view.dom.setAttribute("data-doc-type", opt?.docType ?? "worksheet")
          editor.commands.setContent(CONTENT_MAP[type])
        }
        setAiReply(AI_REPLY_MAP[type])
        setChatPhase("done")
      }, 600)
    },
    [editor],
  )

  // ── Autoplay: auto-select exercises after 1.5s ────────────────

  useEffect(() => {
    if (selectedType) return
    const timer = setTimeout(() => {
      handleSelectType("exercises")
    }, 1500)
    return () => clearTimeout(timer)
  }, [selectedType, handleSelectType])

  // ── AI Edit submit — passes full document context ──────────────

  const handleAiEditSubmit = useCallback(async () => {
    if (!aiEditInstruction.trim() || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return

    setAiEditLoading(true)
    setAiEditResult("")

    // Get selected HTML via DOM serialization
    const slice = editor.state.selection.content()
    const serializer = (await import("@tiptap/pm/model")).DOMSerializer.fromSchema(editor.schema)
    const fragment = serializer.serializeFragment(slice.content)
    const tempDiv = document.createElement("div")
    tempDiv.appendChild(fragment)
    const selectedHtml = tempDiv.innerHTML

    // Get full document HTML for context
    const fullDocumentHtml = (editor.view.dom as HTMLElement).innerHTML

    // Find the closest container around the selection
    const $from = editor.state.selection.$from
    const parentNode = $from.parent
    const parentSerializer = serializer.serializeNode(parentNode)
    const parentDiv = document.createElement("div")
    parentDiv.appendChild(parentSerializer)
    const contextHtml = parentDiv.innerHTML

    const docType = CONTENT_OPTIONS.find((o) => o.id === selectedType)?.docType ?? "worksheet"

    try {
      const res = await fetch("/api/doc/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editMode: "content_edit",
          selectedHtml,
          instruction: aiEditInstruction.trim(),
          documentType: docType,
          contextTag: parentNode.type.name === "paragraph" ? "p" : parentNode.type.name,
          contextHtml,
          targetContainerTag: "p",
          targetContainerHtml: contextHtml,
          fullDocumentHtml: `<article data-doc-type="${docType}">${fullDocumentHtml}</article>`,
          documentMeta: {
            courseName: "AP Calculus AB",
            unitName: "Unit 5: Analytical Applications of Differentiation",
            artifactKind: docType,
          },
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) throw new Error("API error")
      const data = (await res.json()) as { html?: string; modifiedHtml?: string }
      const resultHtml = (data.modifiedHtml ?? data.html ?? "").trim()
      if (!resultHtml) throw new Error("Empty response")
      setAiEditResult(resultHtml)
    } catch {
      // Fallback to preset if API fails
      const lowerInstruction = aiEditInstruction.toLowerCase().trim()
      const presetResult = AI_EDIT_PRESETS[lowerInstruction]
      if (presetResult) {
        setAiEditResult(`<p>${presetResult}</p>`)
      } else {
        setAiEditResult(`<p>AI edit failed. Try "make it harder" or "simplify" for a demo.</p>`)
      }
    } finally {
      setAiEditLoading(false)
    }
  }, [aiEditInstruction, editor, selectedType])

  const applyAiEdit = useCallback(() => {
    if (!editor || !aiEditResult) return
    const { from, to } = editor.state.selection
    // Replace selection with the HTML fragment from AI
    editor.chain().focus().deleteRange({ from, to }).insertContent(aiEditResult).run()
    setShowAiComposer(false)
    setAiEditResult("")
    setAiEditInstruction("")
  }, [editor, aiEditResult])

  // ── Toolbar actions ────────────────────────────────────────────

  const toolbarActions = useMemo(() => {
    if (!editor) return []
    return [
      { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), label: "Bold" },
      { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), label: "Italic" },
      { icon: UnderlineIcon, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline"), label: "Underline" },
      { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }), label: "Heading" },
      { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList"), label: "Bullet list" },
      { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList"), label: "Ordered list" },
    ]
  }, [editor])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="demo-editor relative w-full max-w-5xl mx-auto">
      {/* Scoped styles for tighter demo layout */}
      <style dangerouslySetInnerHTML={{ __html: DEMO_EDITOR_STYLES }} />
      <div className="pointer-events-none absolute -inset-8 rounded-3xl bg-linear-to-b from-default-100/60 via-transparent to-transparent blur-2xl" />

      <Card className="relative overflow-hidden shadow-2xl p-0">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-divider bg-content1 px-5 py-2.5">
          <div className="flex gap-1.5">
            <div className="h-[11px] w-[11px] rounded-full bg-[#FF5F57]/70" />
            <div className="h-[11px] w-[11px] rounded-full bg-[#FFBD2E]/70" />
            <div className="h-[11px] w-[11px] rounded-full bg-[#28C840]/70" />
          </div>
          <div className="ml-3 flex items-center gap-2 text-[12px] text-default-300">
            <Sparkles className="h-3 w-3" />
            <span className="font-medium">Deskmate — Agent Workspace</span>
          </div>
        </div>

        {/* Main split */}
        <div className="flex min-h-[480px] md:min-h-[520px]">
          {/* ─── Left: Chat ─── */}
          <div className="flex w-[34%] flex-col border-r border-divider">
            <div className="flex items-center gap-2.5 border-b border-default-100 px-4 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-foreground">Deskmate</div>
                <div className="text-[10px] text-default-400">AI Teaching Assistant</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-3">
                <ChatBubble role="ai">What would you like to create?</ChatBubble>

                {chatPhase === "choosing" && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="ml-7 flex flex-col gap-1.5">
                    {CONTENT_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      return (
                        <Button key={opt.id} variant="ghost" onPress={() => handleSelectType(opt.id)} className="flex items-center gap-2 border border-divider bg-white px-3 py-2 text-left text-[12px] font-medium text-foreground">
                          <Icon className="h-3.5 w-3.5 text-default-400" />
                          {opt.label}
                        </Button>
                      )
                    })}
                  </motion.div>
                )}

                {selectedType && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <ChatBubble role="user">
                      {CONTENT_OPTIONS.find((o) => o.id === selectedType)?.prompt ?? ""}
                    </ChatBubble>
                  </motion.div>
                )}

                {chatPhase === "generating" && (
                  <ChatBubble role="ai">
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-default-400" />
                      <span className="text-default-400">Generating...</span>
                    </div>
                  </ChatBubble>
                )}

                {chatPhase === "done" && aiReply && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <ChatBubble role="ai">{aiReply}</ChatBubble>
                  </motion.div>
                )}

                {chatPhase === "done" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="ml-7">
                    <p className="mb-1.5 text-[10px] text-default-300">Try another:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTENT_OPTIONS.filter((o) => o.id !== selectedType).map((opt) => {
                        const Icon = opt.icon
                        return (
                          <Button key={opt.id} variant="ghost" size="sm" onPress={() => handleSelectType(opt.id)} className="flex items-center gap-1.5 border border-divider px-2.5 py-1.5 text-[11px] font-medium text-default-400">
                            <Icon className="h-3 w-3" />
                            {opt.label}
                          </Button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            <div className="border-t border-default-100 px-3 py-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-divider bg-white px-3 py-2">
                <Paperclip className="h-3.5 w-3.5 text-default-200" />
                <span className="flex-1 text-[11px] text-default-200">Ask Deskmate anything...</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground">
                  <Send className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* ─── Right: Tiptap Editor ─── */}
          <div className="flex flex-1 flex-col bg-white">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-divider px-4 py-1.5">
              <div className="flex items-center gap-0.5">
                {toolbarActions.map((btn) => {
                  const Icon = btn.icon
                  return (
                    <Button key={btn.label} isIconOnly variant="ghost" size="sm" onPress={btn.action} aria-label={btn.label} className={cn("rounded p-1.5", btn.active ? "bg-default-200 text-foreground" : "text-default-300")}>
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                {selectedType && (
                  <Button size="sm" className="flex items-center gap-1.5 bg-foreground px-3 py-1 text-[11px] font-medium text-white">
                    <Download className="h-3 w-3" />
                    Export PDF
                  </Button>
                )}
              </div>
            </div>

            {/* Document tab */}
            {selectedType && (
              <div className="flex items-center gap-1 border-b border-default-100 px-4 py-1">
                <div className="flex items-center gap-1.5 rounded-md bg-default-100 px-2.5 py-1 text-[11px] font-medium text-foreground border border-default-100">
                  <FileText className="h-3 w-3" />
                  {CONTENT_OPTIONS.find((o) => o.id === selectedType)?.label ?? "Document"}
                </div>
              </div>
            )}

            {/* Editor area */}
            <div className="flex-1 overflow-y-auto">
              {editor && (
                <>
                  <EditorContent editor={editor} />

                  {/* BubbleMenu with AI Edit */}
                  <BubbleMenu
                    editor={editor}
                    shouldShow={({ state }) => !state.selection.empty && state.selection.to - state.selection.from >= 3}
                    options={{ placement: "top", offset: 10 }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    {/* Format toolbar */}
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex items-center gap-0.5 rounded-full bg-white/95 p-1 shadow-md backdrop-blur-xl"
                    >
                      <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                        <Bold className="h-3.5 w-3.5" />
                      </BubbleBtn>
                      <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                        <Italic className="h-3.5 w-3.5" />
                      </BubbleBtn>
                      <BubbleBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                        <UnderlineIcon className="h-3.5 w-3.5" />
                      </BubbleBtn>
                      <div className="mx-0.5 h-4 w-px bg-neutral-200" />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShowAiComposer(!showAiComposer)
                          setAiEditResult("")
                          setAiEditInstruction("")
                          setTimeout(() => aiInputRef.current?.focus(), 100)
                        }}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                          showAiComposer ? "bg-violet-100 text-violet-700" : "text-violet-600 hover:bg-violet-50",
                        )}
                      >
                        <WandSparkles className="h-3 w-3" />
                        AI
                      </button>
                    </div>

                    {/* AI composer dropdown */}
                    {showAiComposer && (
                      <div
                        onMouseDown={(e) => e.preventDefault()}
                        className="w-72 rounded-xl bg-white p-3 shadow-lg"
                      >
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            handleAiEditSubmit()
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            ref={aiInputRef}
                            type="text"
                            value={aiEditInstruction}
                            onChange={(e) => setAiEditInstruction(e.target.value)}
                            placeholder="Make it harder, simplify..."
                            className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-foreground outline-hidden placeholder:text-neutral-400 focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
                          />
                          <button
                            type="submit"
                            disabled={aiEditLoading || !aiEditInstruction.trim()}
                            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors disabled:opacity-40 hover:bg-violet-700"
                          >
                            {aiEditLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Go"}
                          </button>
                        </form>

                        {aiEditLoading && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-violet-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            AI is rewriting...
                          </div>
                        )}

                        {aiEditResult && (
                          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                            <div className="prose prose-sm max-w-none text-[12px] leading-relaxed text-emerald-900 prose-p:my-1 prose-strong:text-emerald-900" dangerouslySetInnerHTML={{ __html: aiEditResult }} />
                            <div className="mt-2 flex justify-end gap-1.5">
                              <button
                                onClick={() => { setAiEditResult(""); setAiEditInstruction("") }}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-neutral-500 hover:bg-neutral-100"
                              >
                                <RotateCcw className="h-2.5 w-2.5" />
                                Retry
                              </button>
                              <button
                                onClick={applyAiEdit}
                                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                              >
                                <Check className="h-2.5 w-2.5" />
                                Apply
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </BubbleMenu>
                </>
              )}
            </div>

            {/* Status bar */}
            <div className="border-t border-default-100 px-5 py-2">
              <div className="flex items-center justify-between text-[10px] text-default-200">
                <span>{selectedType ? `AP Calculus AB · ${CONTENT_OPTIONS.find((o) => o.id === selectedType)?.label}` : "No document"}</span>
                <span>{selectedType ? "Select text → AI rewrite" : ""}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <p className="mt-4 text-center text-[13px] text-default-300">
        {selectedType
          ? "Live editor — select text and click AI to rewrite. Try \"make it harder\" or \"simplify\"."
          : "Chat on the left, editable documents on the right."}
      </p>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────

function ChatBubble({ role, children }: { role: "ai" | "user"; children: React.ReactNode }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5">
          <div className="text-[12px] leading-normal text-white">{children}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground">
        <Sparkles className="h-2.5 w-2.5 text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-md bg-default-100 px-3.5 py-2.5">
        <div className="text-[12px] leading-normal text-foreground">{children}</div>
      </div>
    </div>
  )
}

function BubbleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded-full p-1.5 transition-colors",
        active ? "bg-neutral-200 text-neutral-900" : "text-neutral-500 hover:bg-neutral-100",
      )}
    >
      {children}
    </button>
  )
}
