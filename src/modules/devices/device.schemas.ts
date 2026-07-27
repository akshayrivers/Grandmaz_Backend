import { z } from "zod";

export const RegisterDeviceSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  publicKey: z.string().min(1, "Public key is required"),
  deviceMetadata: z.record(z.string(), z.any()).optional(),
});

export const CreateChallengeSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
});

export const VerifyChallengeSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  challenge: z.string().min(1, "Challenge string is required"),
  signature: z.string().min(1, "Signature string is required"),
});

export const GetDeviceParamsSchema = z.object({
  deviceId: z.string().min(1, "Device ID parameter is required"),
});

export type RegisterDeviceSchemaInput = z.infer<typeof RegisterDeviceSchema>;
export type CreateChallengeSchemaInput = z.infer<typeof CreateChallengeSchema>;
export type VerifyChallengeSchemaInput = z.infer<typeof VerifyChallengeSchema>;
