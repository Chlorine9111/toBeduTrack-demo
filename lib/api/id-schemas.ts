import { z } from "zod";

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidLikeSchema = z
  .string()
  .trim()
  .regex(UUID_LIKE_PATTERN, "Invalid UUID");

export const optionalUuidLikeSchema = z.preprocess((value) => {
  if (value === "") return undefined;
  return value;
}, uuidLikeSchema.optional());

export const optionalNullableUuidLikeSchema = z.preprocess((value) => {
  if (value === "") return null;
  return value;
}, uuidLikeSchema.nullable().optional());
