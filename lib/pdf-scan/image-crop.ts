import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { CropRegion } from "./types"

export function clampRegion(region: CropRegion, width: number, height: number): CropRegion {
  const x1 = Math.max(0, Math.min(width, Math.round(region.x1)))
  const y1 = Math.max(0, Math.min(height, Math.round(region.y1)))
  const x2 = Math.max(0, Math.min(width, Math.round(region.x2)))
  const y2 = Math.max(0, Math.min(height, Math.round(region.y2)))

  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  }
}

export async function cropImageBuffer(
  imageBuffer: Buffer,
  region: CropRegion
): Promise<Buffer | null> {
  const image = await loadImage(imageBuffer)
  const width = image.width
  const height = image.height
  const clamped = clampRegion(region, width, height)
  const cropWidth = Math.max(1, clamped.x2 - clamped.x1)
  const cropHeight = Math.max(1, clamped.y2 - clamped.y1)

  const canvas = createCanvas(cropWidth, cropHeight)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    clamped.x1,
    clamped.y1,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  )

  return canvas.toBuffer('image/png')
}
