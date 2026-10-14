import { z } from "zod";

export const postSnapshotSchema = z.object({
  batteryLevel: z.number().int().min(0).max(100).optional(),
  batteryStatus: z.string().max(50).optional(),
  wifiSsid: z.string().max(255).optional(),
  storageFreeMb: z.number().nonnegative().optional(),
  installedApps: z.array(z.unknown()).max(1000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  snapshotData: z.record(z.string(), z.unknown()).optional(),
});

export const snapshotHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
