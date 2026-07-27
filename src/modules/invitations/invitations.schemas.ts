import { z } from "zod";

export const CreateInvitationSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  email: z.string().email("Valid email address is required"),
  deviceName: z.string().optional(),
});

export const GetInvitationParamsSchema = z.object({
  token: z.string().min(1, "Token parameter is required"),
});

export type CreateInvitationSchemaInput = z.infer<typeof CreateInvitationSchema>;
export type GetInvitationParamsSchemaInput = z.infer<typeof GetInvitationParamsSchema>;
