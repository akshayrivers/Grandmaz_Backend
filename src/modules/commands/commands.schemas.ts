import { z } from "zod";
import { E164_REGEX } from "../../shared/utils/crypto.js";

/** Every command the launcher understands. Keep in sync with the launcher's CommandExecutionManager. */
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ring_device") }).strict(),
  z.object({ type: z.literal("sync_now") }).strict(),
  z.object({ type: z.literal("report_location") }).strict(),
  z
    .object({
      type: z.literal("show_message"),
      text: z.string().trim().min(1).max(500),
      voiceClipId: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_volume"),
      level: z.number().int().min(0).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_emergency_number"),
      e164: z.string().trim().regex(E164_REGEX, "Phone number must be in E.164 format, e.g. +919876543210"),
    })
    .strict(),
]);

export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command["type"];

export const createTaskSchema = z.object({
  deviceId: z.string().min(1),
  command: CommandSchema,
  expiresInMinutes: z.number().int().min(1).max(1440).default(60),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(["pending", "running", "completed", "failed", "expired", "cancelled"]).optional(),
});

export const deviceListTasksQuerySchema = z.object({
  status: z.literal("pending").default("pending"),
});

export const deviceUpdateTaskStatusSchema = z.object({
  status: z.enum(["running", "completed", "failed"]),
  result: z.record(z.string(), z.unknown()).optional(),
});

export const taskIdParamsSchema = z.object({
  id: z.uuid("Invalid command id"),
});

export const COMMAND_TITLES: Record<CommandType, string> = {
  ring_device: "Ring device",
  sync_now: "Sync now",
  report_location: "Report location",
  show_message: "Show message",
  set_volume: "Set volume",
  update_emergency_number: "Update emergency number",
};
