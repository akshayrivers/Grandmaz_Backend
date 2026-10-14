import { z } from "zod";

export const uploadMediaSchema = z
  .object({
    kind: z.enum(["photo", "audio"]),
    contentType: z.string().trim().min(1).max(100),
    dataBase64: z.string().min(1).max(8_000_000),
    durationMs: z.number().int().positive().max(30_000).optional(),
  })
  .strict();

export const assetIdParamsSchema = z.object({
  assetId: z.uuid("Invalid asset id"),
});
