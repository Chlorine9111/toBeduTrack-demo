/**
 * 客户端临时文件存储
 * 用于在 /main 首页选择 PDF 后传递到 /main/agent 页面
 * 利用 Next.js 客户端导航（SPA）时内存不清除的特性
 */
let pendingFile: File | null = null

export function setPendingPdfFile(file: File): void {
  pendingFile = file
}

export function consumePendingPdfFile(): File | null {
  const f = pendingFile
  pendingFile = null
  return f
}
