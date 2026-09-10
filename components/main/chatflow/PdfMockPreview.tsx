"use client"

import { motion } from "motion/react"
import { Button } from "@heroui/react"
import { Download } from "lucide-react"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import type { MockExercise } from "./types"

interface PdfMockPreviewProps {
  title: string
  exercises: MockExercise[]
  onAction?: (action: string) => void
}

export default function PdfMockPreview({
  title,
  exercises,
  onAction,
}: PdfMockPreviewProps) {
  return (
    <div className="h-full flex flex-col px-6 py-6">
      {/* 标题 */}
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        PDF Preview
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        模拟 A4 试卷预览，支持导出
      </p>

      {/* 纸张区域 */}
      <div className="flex-1 overflow-auto bg-gray-100 rounded-xl p-6 flex justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-[640px] bg-white rounded-sm shadow-xl"
          style={{
            minHeight: 800,
            aspectRatio: "210 / 297",
          }}
        >
          {/* 试卷头部 */}
          <div className="px-10 pt-10 pb-6 border-b border-gray-200 text-center">
            <h3 className="text-base font-bold text-gray-900 tracking-wide">
              {title || "AP Calculus AB/BC"}
            </h3>
            <p className="text-sm text-gray-600 mt-1">Unit Test</p>
            <div className="flex justify-between mt-4 text-sm text-gray-500">
              <span>
                Name: <span className="inline-block w-40 border-b border-gray-400" />
              </span>
              <span>
                Date: <span className="inline-block w-28 border-b border-gray-400" />
              </span>
            </div>
          </div>

          {/* 试题内容 */}
          <div className="px-10 py-6 space-y-5">
            {exercises.map((ex, i) => (
              <div key={ex.id}>
                <div className="text-sm text-gray-800">
                  <div className="mb-1.5">
                    <div className="font-medium">{i + 1}.</div>
                    <QuestionContentWithImages
                      content={ex.questionText}
                      className="mt-1"
                      textClassName="text-sm leading-6 text-gray-800"
                      galleryClassName="mt-2 grid gap-2"
                      figureClassName="bg-white"
                      imageClassName="max-h-[180px] w-full object-scale-down"
                    />
                  </div>
                  {ex.options && ex.options.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 pl-5 text-gray-600">
                      {ex.options.map((opt) => (
                        <div key={opt.label}>
                          <div className="font-medium">{opt.label})</div>
                          <QuestionContentWithImages
                            content={opt.text}
                            className="mt-1"
                            textClassName="text-sm leading-6 text-gray-600"
                            galleryClassName="mt-2 grid gap-2"
                            figureClassName="bg-white"
                            imageClassName="max-h-[120px] w-full object-scale-down"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {(i + 1) % 4 === 0 && i !== exercises.length - 1 && (
                  <div className="border-t-2 border-dashed border-gray-300 my-4 relative">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white px-2 text-[10px] text-gray-400">
                      Page {Math.floor((i + 1) / 4)}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {exercises.length === 0 && (
              <div className="text-center text-gray-400 py-10 text-sm">
                暂无试题内容
              </div>
            )}
          </div>

          {/* 试卷页脚 */}
          <div className="px-10 py-4 text-center text-xs text-gray-400 mt-auto">
            --- End of Exam ---
          </div>
        </motion.div>
      </div>

      {/* 底部操作 */}
      <div className="flex items-center gap-3 mt-5">
        <Button variant="primary" onPress={() => onAction?.("download_pdf")} className="bg-gray-900">
          <Download className="w-4 h-4" />
          下载 PDF
        </Button>
        <Button variant="secondary" onPress={() => onAction?.("download_pdf_with_answers")}>
          <Download className="w-4 h-4" />
          含答案版本
        </Button>
      </div>
    </div>
  )
}
