import { loadImage, createCanvas } from "@napi-rs/canvas";

export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");

  context.drawImage(image, 0, 0, image.width, image.height);

  const imageData = context.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const enhanced = gray > 170 ? 255 : gray < 80 ? 0 : gray;
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/jpeg", 0.9);
}
