import { z } from "zod";

export const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatarUrl: z.string().url().optional(),
});

export type UpdateUserProfileBody = z.infer<typeof updateUserProfileSchema>;
