import { z } from "zod";
import { E164_REGEX } from "../../shared/utils/crypto.js";

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    phoneE164: z
      .string()
      .trim()
      .regex(E164_REGEX, "Phone number must be in E.164 format, e.g. +919876543210")
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateUserProfileBody = z.infer<typeof updateUserProfileSchema>;
