"use client"

import { Spinner } from "@heroui/react"
import { CheckCircle2, FileText, ScanSearch, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

type ScanStep = "uploading" | "ocr" | "parsing" | "completed" | "failed"

interface PdfScanProgressProps {
  fileName: string
  currentStep: ScanStep
  progress: number
  questionCount?: number
  errorMessage?: string
}

const STEPS: Array<{ key: ScanStep; label: string; icon: typeof Upload }> = [
  { key: "uploading", label: "上传文件", icon: Upload },
  { key: "ocr", label: "OCR 识别", icon: ScanSearch },
  { key: "parsing", label: "解析题目", icon: FileText },
  { key: "completed", label: "完成", icon: CheckCircle2 },
]

function stepIndex(step: ScanStep): number {
  if (step === "failed") return -1
  return STEPS.findIndex((s) => s.key === step)
}

export default function PdfScanProgress({
  fileName,
  currentStep,
  progress,
  questionCount,
  errorMessage,
}: PdfScanProgressProps) {
  const activeIdx = stepIndex(currentStep)

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-800">
        <FileText className="h-4 w-4" />
        <span className="truncate">{fileName}</span>
      </div>

      {currentStep === "failed" ? (
        <p className="text-sm text-red-600">{errorMessage || "扫描失败"}</p>
      ) : (
        <>
          <div className="flex items-center gap-1">
            {STEPS.map((step, idx) => {
              const Icon = step.icon
              const isDone = idx < activeIdx
              const isActive = idx === activeIdx
              const isPending = idx > activeIdx

              return (
                <div key={step.key} className="flex flex-1 items-center gap-1">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-1 text-xs",
                      isDone && "bg-blue-100 text-blue-700",
                      isActive && "bg-blue-600 text-white",
                      isPending && "bg-gray-100 text-gray-400",
                    )}
                  >
                    {isActive && currentStep !== "completed" ? (
                      <Spinner size="sm" className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    <span>{step.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "h-px flex-1",
                        idx < activeIdx ? "bg-blue-300" : "bg-gray-200",
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {currentStep !== "completed" && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            </div>
          )}

          {currentStep === "completed" && questionCount != null && (
            <p className="mt-2 text-sm text-blue-700">
              识别到 {questionCount} 道题目
            </p>
          )}
        </>
      )}
    </div>
  )
}
