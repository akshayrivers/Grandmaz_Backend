import { z } from "zod";

const deviceIdSchema = z
  .string()
  .min(8, "Device ID must be at least 8 characters")
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/, "Device ID contains invalid characters");

export const RegisterDeviceSchema = z.object({
  deviceId: deviceIdSchema,
  publicKey: z.string().min(1, "Public key is required").max(4096),
  keyAlgorithm: z.enum(["EC_P256", "RSA"]).default("RSA"),
  deviceMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const CreateChallengeSchema = z.object({
  deviceId: deviceIdSchema,
});

export const VerifyChallengeSchema = z.object({
  deviceId: deviceIdSchema,
  challenge: z.string().min(1, "Challenge string is required").max(128),
  signature: z.string().min(1, "Signature string is required").max(2048),
});

export const DeviceParamsSchema = z.object({
  deviceId: z.string().min(1, "Device ID parameter is required"),
});

export const RenameDeviceSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

export const PushTokenSchema = z.object({
  fcmToken: z.string().min(1).max(4096),
});
