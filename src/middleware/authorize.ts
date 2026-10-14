import type { FastifyRequest, FastifyReply } from "fastify";
import {
  getCaretakerAccess,
  type CaretakerRole,
} from "../infra/database/queries/device_caretakers.queries.js";
import { AppError } from "../shared/errors/app-error.js";
import { getCurrentUser } from "./authenticate.js";
import { getAuthenticatedDevice } from "./authenticate-device.js";

export interface DeviceAccess {
  deviceUuid: string;
  deviceId: string;
  role: CaretakerRole;
  userId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    deviceAccess?: DeviceAccess;
  }
}

export const ANY_ROLE: readonly CaretakerRole[] = ["primary", "caretaker", "viewer"];
export const WRITE_ROLES: readonly CaretakerRole[] = ["primary", "caretaker"];
export const PRIMARY_ONLY: readonly CaretakerRole[] = ["primary"];

export interface RequireDeviceAccessOptions {
  /** Route param holding the device id (string id or UUID). */
  param?: string;
  /** Body field holding the device id. */
  bodyField?: string;
  /**
   * Resolves the device from another resource (e.g. a task id). Return null when the
   * resource doesn't exist; the hook then answers 404 with `notFoundCode`.
   */
  resolve?: (request: FastifyRequest) => Promise<string | null>;
  notFoundCode?: string;
  roles?: readonly CaretakerRole[];
}

function readField(source: unknown, key: string): string | null {
  if (source && typeof source === "object" && key in source) {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return null;
}

/**
 * preHandler factory: the authenticated caretaker must have an ACTIVE link to the device
 * with one of `roles`. Sets `request.deviceAccess`. Must run after `authenticateFirebaseUser`.
 */
export function requireDeviceAccess(options: RequireDeviceAccessOptions) {
  const roles = options.roles ?? ANY_ROLE;

  return async function deviceAccessHook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    let identifier: string | null = null;
    if (options.param) {
      identifier = readField(request.params, options.param);
    } else if (options.bodyField) {
      identifier = readField(request.body, options.bodyField);
    } else if (options.resolve) {
      identifier = await options.resolve(request);
      if (!identifier) {
        throw new AppError(404, options.notFoundCode ?? "NOT_FOUND", "Resource not found");
      }
    }

    if (!identifier) {
      throw new AppError(400, "VALIDATION_ERROR", "deviceId is required");
    }

    const user = await getCurrentUser(request);
    const access = await getCaretakerAccess(user.id, identifier);
    if (!access || !roles.includes(access.role)) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this device");
    }

    request.deviceAccess = {
      deviceUuid: access.device_uuid,
      deviceId: access.device_id,
      role: access.role,
      userId: user.id,
    };
  };
}

export function getDeviceAccess(request: FastifyRequest): DeviceAccess {
  if (!request.deviceAccess) {
    throw new AppError(403, "FORBIDDEN", "Device access not established");
  }
  return request.deviceAccess;
}

/**
 * For device-token routes: throws 404 unless `resourceDeviceUuid` belongs to the
 * authenticated device (we answer 404, not 403, so ids of other devices aren't confirmed).
 */
export function requireSameDevice(
  request: FastifyRequest,
  resourceDeviceUuid: string | null | undefined,
  notFoundCode = "NOT_FOUND"
): void {
  const device = getAuthenticatedDevice(request);
  if (!resourceDeviceUuid || resourceDeviceUuid !== device.uuid) {
    throw new AppError(404, notFoundCode, "Resource not found");
  }
}
