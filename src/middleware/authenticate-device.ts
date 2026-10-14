import type { FastifyRequest, FastifyReply } from "fastify";
import { findDeviceByActiveTokenHash } from "../infra/database/queries/device_auth.queries.js";
import { AppError } from "../shared/errors/app-error.js";
import { sha256Hex } from "../shared/utils/crypto.js";
import { extractBearerToken } from "./authenticate.js";

export interface AuthenticatedDevice {
  /** devices.id (UUID) */
  uuid: string;
  /** devices.device_id (string id chosen by the launcher) */
  deviceId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    device?: AuthenticatedDevice;
  }
}

export const DEVICE_TOKEN_PREFIX = "dt_";

/** preHandler: requires `Authorization: Bearer dt_…` and sets `request.device`. */
export async function authenticateDevice(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request);
  if (!token || !token.startsWith(DEVICE_TOKEN_PREFIX)) {
    throw new AppError(401, "DEVICE_TOKEN_INVALID", "Missing or malformed device token");
  }

  const device = await findDeviceByActiveTokenHash(sha256Hex(token));
  if (!device || device.status !== "active") {
    throw new AppError(401, "DEVICE_TOKEN_INVALID", "Device token is invalid, expired or revoked");
  }

  request.device = { uuid: device.id, deviceId: device.device_id };
}

export function getAuthenticatedDevice(request: FastifyRequest): AuthenticatedDevice {
  if (!request.device) {
    throw new AppError(401, "DEVICE_TOKEN_INVALID", "Device not authenticated");
  }
  return request.device;
}
