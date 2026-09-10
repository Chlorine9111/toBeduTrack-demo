export type ScanFileType = "pdf" | "image" | "word"

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
])

const WORD_EXTENSIONS = new Set(["doc", "docx"])

const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/octet-stream",
])

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] // %PDF
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04] // PK..
const OLE_MAGIC_BYTES = [0xd0, 0xcf, 0x11, 0xe0]
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47]
const JPEG_MAGIC_PREFIX = [0xff, 0xd8, 0xff]

export function getFileExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? ""
  const parts = base.split(".")
  if (parts.length < 2) return ""
  return parts[parts.length - 1].toLowerCase()
}

export function detectScanFileType(params: {
  fileName: string
  mimeType?: string | null
}): ScanFileType | null {
  const ext = getFileExtension(params.fileName)
  const mime = (params.mimeType ?? "").toLowerCase()

  if (ext === "pdf" || mime === "application/pdf") {
    return "pdf"
  }

  if (IMAGE_EXTENSIONS.has(ext) || mime.startsWith("image/")) {
    return "image"
  }

  if (WORD_EXTENSIONS.has(ext) || WORD_MIME_TYPES.has(mime)) {
    return "word"
  }

  return null
}

function hasPrefix(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
  return riff === "RIFF" && webp === "WEBP"
}

export function assertFileHeader(params: {
  fileType: ScanFileType
  fileName: string
  bytes: Uint8Array
}): void {
  const { fileType, fileName, bytes } = params
  const ext = getFileExtension(fileName)

  if (fileType === "pdf") {
    if (!hasPrefix(bytes, PDF_MAGIC_BYTES)) {
      throw new Error("文件格式不正确，请上传有效的 PDF")
    }
    return
  }

  if (fileType === "word") {
    const isDocx = ext === "docx"
    const valid = isDocx
      ? hasPrefix(bytes, ZIP_MAGIC_BYTES)
      : hasPrefix(bytes, OLE_MAGIC_BYTES) || hasPrefix(bytes, ZIP_MAGIC_BYTES)
    if (!valid) {
      throw new Error("Word 文件头校验失败，请上传有效的 .doc 或 .docx")
    }
    return
  }

  const validImage =
    hasPrefix(bytes, PNG_MAGIC_BYTES) ||
    hasPrefix(bytes, JPEG_MAGIC_PREFIX) ||
    isWebp(bytes)

  if (!validImage) {
    throw new Error("图片文件头校验失败，请上传 PNG/JPG/WEBP 图片")
  }
}

export function getAllowedUploadHint(): string {
  return "支持 PDF、图片（png/jpg/webp）和 Word（doc/docx）"
}
