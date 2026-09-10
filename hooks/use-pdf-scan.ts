"use client"

import { useCallback, useRef, useState } from "react"
import { apiGet, apiPost, apiPostFormData } from "@/lib/api/client"
import { adaptScannedQuestions } from "@/lib/api/adapters/pdf-scan"
import type { MockExercise } from "@/components/main/chatflow/types"
import type { PdfScanStats, ScannedQuestion } from "@/lib/pdf-scan/types"

type ScanStatus = "idle" | "uploading" | "processing" | "completed" | "failed"

interface PdfScanState {
  status: ScanStatus
  uploadId: string | null
  fileName: string | null
  progress: number
  progressLabel: string
  questions: MockExercise[] | null
  stats: PdfScanStats | null
  error: string | null
  // 多文件上传相关
  fileNames: string[]
  currentFileIndex: number
  totalFiles: number
  allQuestions: MockExercise[] | null
}

type UploadResponse = {
  uploadId: string
  fileName: string
  fileSize: number
}

type StatusResponse = {
  status: string
  progress: number
}

type ProcessResponse = {
  questions: ScannedQuestion[]
  stats: PdfScanStats
}

const POLL_INTERVAL = 3000
const MAX_POLL_TIME = 360000

const INITIAL_STATE: PdfScanState = {
  status: "idle",
  uploadId: null,
  fileName: null,
  progress: 0,
  progressLabel: "",
  questions: null,
  stats: null,
  error: null,
  fileNames: [],
  currentFileIndex: 0,
  totalFiles: 0,
  allQuestions: null,
}

export function usePdfScan() {
  const [state, setState] = useState<PdfScanState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)

  const upload = useCallback(async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState({
      ...INITIAL_STATE,
      status: "uploading",
      fileName: file.name,
      progress: 10,
      progressLabel: "正在上传...",
    })

    try {
      const formData = new FormData()
      formData.append("file", file)

      const { uploadId } = await apiPostFormData<UploadResponse>(
        "/api/pdf/upload-scan",
        formData,
        { timeoutMs: 60000, signal: controller.signal },
      )

      setState((prev) => ({
        ...prev,
        status: "processing",
        uploadId,
        progress: 30,
        progressLabel: "文档识别中...",
      }))

      const startTime = Date.now()
      let completed = false

      while (!completed && Date.now() - startTime < MAX_POLL_TIME) {
        if (controller.signal.aborted) return

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))

        const statusResp = await apiGet<StatusResponse>(
          `/api/pdf/scan-status/${uploadId}`,
        )

        if (statusResp.status === "completed") {
          completed = true
          setState((prev) => ({
            ...prev,
            progress: 70,
            progressLabel: "正在解析题目...",
          }))
        } else if (statusResp.status === "failed") {
          throw new Error("文档识别失败")
        } else {
          setState((prev) => ({
            ...prev,
            progress: 30 + Math.round(statusResp.progress * 0.4),
            progressLabel: `文档识别中... ${statusResp.progress}%`,
          }))
        }
      }

      if (!completed) {
        throw new Error("文档识别超时")
      }

      const result = await apiPost<ProcessResponse>(
        "/api/pdf/process-scan",
        { uploadId },
        { timeoutMs: 120000, signal: controller.signal },
      )

      const exercises = adaptScannedQuestions(result.questions)

      setState((prev) => ({
        ...prev,
        status: "completed",
        progress: 100,
        progressLabel: `识别到 ${exercises.length} 道题目`,
        questions: exercises,
        stats: result.stats,
      }))
    } catch (err) {
      if (controller.signal.aborted) return

      const message =
        err instanceof Error ? err.message : "扫描失败，请重试"

      setState((prev) => ({
        ...prev,
        status: "failed",
        error: message,
        progressLabel: message,
      }))
    }
  }, [])

  // 多文件顺序上传：逐个处理 PDF 并合并结果
  const uploadMultiple = useCallback(async (files: File[]) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const names = files.map((f) => f.name)
    setState({
      ...INITIAL_STATE,
      status: "uploading",
      fileNames: names,
      totalFiles: files.length,
      currentFileIndex: 0,
      progress: 5,
      progressLabel: `正在上传 ${names[0]} (1/${files.length})...`,
    })

    const allExercises: MockExercise[] = []
    let allStats: PdfScanStats | null = null

    try {
      for (let i = 0; i < files.length; i++) {
        if (controller.signal.aborted) return

        const file = files[i]
        const baseProgress = Math.round((i / files.length) * 100)

        // 上传阶段
        setState((prev) => ({
          ...prev,
          status: "uploading",
          currentFileIndex: i,
          fileName: file.name,
          progress: baseProgress + 5,
          progressLabel: `正在上传 ${file.name} (${i + 1}/${files.length})...`,
        }))

        const formData = new FormData()
        formData.append("file", file)
        const { uploadId } = await apiPostFormData<UploadResponse>(
          "/api/pdf/upload-scan",
          formData,
          { timeoutMs: 60000, signal: controller.signal },
        )

        // OCR 轮询阶段
        setState((prev) => ({
          ...prev,
          status: "processing",
          uploadId,
          progress: baseProgress + 20,
          progressLabel: `文档识别中: ${file.name} (${i + 1}/${files.length})...`,
        }))

        const startTime = Date.now()
        let completed = false
        while (!completed && Date.now() - startTime < MAX_POLL_TIME) {
          if (controller.signal.aborted) return
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
          const statusResp = await apiGet<StatusResponse>(
            `/api/pdf/scan-status/${uploadId}`,
          )
          if (statusResp.status === "completed") {
            completed = true
          } else if (statusResp.status === "failed") {
            throw new Error(`文档识别失败: ${file.name}`)
          }
        }
        if (!completed) throw new Error(`文档识别超时: ${file.name}`)

        // 解析阶段
        setState((prev) => ({
          ...prev,
          progress: baseProgress + 60,
          progressLabel: `正在解析: ${file.name} (${i + 1}/${files.length})...`,
        }))

        const result = await apiPost<ProcessResponse>(
          "/api/pdf/process-scan",
          { uploadId },
          { timeoutMs: 120000, signal: controller.signal },
        )

        const exercises = adaptScannedQuestions(result.questions)
        allExercises.push(...exercises)

        // 合并统计信息（不可变方式）
        if (result.stats) {
          if (!allStats) {
            allStats = { ...result.stats }
          } else {
            const prev: PdfScanStats = allStats
            allStats = {
              total: prev.total + result.stats.total,
              lowConfidenceCount:
                prev.lowConfidenceCount + result.stats.lowConfidenceCount,
              averageConfidence:
                (prev.averageConfidence + result.stats.averageConfidence) / 2,
              byType: { ...prev.byType, ...result.stats.byType },
            }
          }
        }
      }

      setState((prev) => ({
        ...prev,
        status: "completed",
        progress: 100,
        progressLabel: `共识别到 ${allExercises.length} 道题目（${files.length} 个文件）`,
        questions: allExercises,
        allQuestions: allExercises,
        stats: allStats,
      }))
    } catch (err) {
      if (controller.signal.aborted) return

      const message =
        err instanceof Error ? err.message : "扫描失败，请重试"

      setState((prev) => ({
        ...prev,
        status: "failed",
        error: message,
        progressLabel: message,
        // 即使部分失败也保留已解析的题目
        questions: allExercises.length > 0 ? allExercises : null,
        allQuestions: allExercises.length > 0 ? allExercises : null,
      }))
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(INITIAL_STATE)
  }, [])

  return { ...state, upload, uploadMultiple, reset }
}
