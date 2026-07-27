import { z } from "zod";

export const postSnapshotSchema = z.object({
  deviceId: z.string().min(1),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  batteryStatus: z.string().optional(),
  wifiSsid: z.string().optional(),
  storageFreeMb: z.number().optional(),
  installedApps: z.any().optional(),
  settings: z.any().optional(),
  snapshotData: z.any().optional(),
});
