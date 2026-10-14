import { z } from "zod";

const coord = z.number().finite();

export const startSosSchema = z
  .object({
    latitude: coord.min(-90).max(90).nullable().optional(),
    longitude: coord.min(-180).max(180).nullable().optional(),
    accuracyM: z.number().int().nonnegative().max(100_000).nullable().optional(),
  })
  .strict();

export const sosLocationSchema = z
  .object({
    latitude: coord.min(-90).max(90),
    longitude: coord.min(-180).max(180),
    accuracyM: z.number().int().nonnegative().max(100_000).nullable().optional(),
  })
  .strict();

export const sosEventParamsSchema = z.object({
  id: z.uuid("Invalid SOS id"),
});
