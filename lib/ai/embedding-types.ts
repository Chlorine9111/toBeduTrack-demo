export type MultimodalEmbeddingTextPart = {
  type: "text";
  text: string;
};

export type MultimodalEmbeddingFilePart = {
  type: "file";
  mimeType: string;
  fileBuffer: Buffer;
  displayName?: string | null;
};

export type MultimodalEmbeddingPart =
  | MultimodalEmbeddingTextPart
  | MultimodalEmbeddingFilePart;

export type MultimodalEmbeddingInput = {
  parts: MultimodalEmbeddingPart[];
  textFallback?: string | null;
};

export function isMultimodalEmbeddingInput(
  value: string | MultimodalEmbeddingInput,
): value is MultimodalEmbeddingInput {
  return typeof value === "object" && value !== null && Array.isArray(value.parts);
}

export function extractEmbeddingTextFallback(
  input: string | MultimodalEmbeddingInput,
): string {
  if (typeof input === "string") {
    return input;
  }

  const explicitFallback = `${input.textFallback ?? ""}`.trim();
  if (explicitFallback) {
    return explicitFallback;
  }

  const textParts = input.parts
    .filter((part): part is MultimodalEmbeddingTextPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean);

  return textParts.join("\n\n").trim();
}
