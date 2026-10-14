import { withTransaction } from "../../infra/database/client.js";
import {
  findDeviceConfig,
  insertDeviceConfig,
  insertDeviceConfigHistory,
  updateDeviceConfigIfVersion,
  type DeviceConfigRow,
} from "../../infra/database/queries/device_config.queries.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";
import { DEFAULT_DEVICE_CONFIG, DeviceConfigSchema, type DeviceConfig } from "./device-config.schemas.js";
import type { DeviceConfigRecord } from "./device-config.types.js";

function parseStoredConfig(value: unknown): DeviceConfig {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  const result = DeviceConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(500, "CONFIG_INVALID", "Stored device config is invalid");
  }
  return result.data;
}

function toRecord(row: DeviceConfigRow, deviceId: string): DeviceConfigRecord {
  return {
    deviceId,
    version: row.version,
    config: parseStoredConfig(row.config),
    updatedByUserId: row.updated_by_user,
    updatedByDeviceId: row.updated_by_device ? deviceId : null,
    updatedAt: row.updated_at,
  };
}

export class DeviceConfigService {
  /** Version 0 is the unsaved default. The first successful PUT uses If-Match: 0. */
  async get(deviceUuid: string, deviceId: string): Promise<DeviceConfigRecord> {
    const row = await findDeviceConfig(deviceUuid);
    if (!row) {
      return {
        deviceId,
        version: 0,
        config: structuredClone(DEFAULT_DEVICE_CONFIG),
        updatedByUserId: null,
        updatedByDeviceId: null,
        updatedAt: null,
      };
    }
    return toRecord(row, deviceId);
  }

  /**
   * Replaces the whole document when `expectedVersion` is still current.
   * A lost create or update answers 409 with the version now stored.
   */
  async save(input: {
    deviceUuid: string;
    deviceId: string;
    expectedVersion: number;
    config: DeviceConfig;
    updatedByUser: string | null;
    updatedByDevice: string | null;
  }): Promise<DeviceConfigRecord> {
    const configJson = JSON.stringify(input.config);

    return withTransaction(async (tx) => {
      const row =
        input.expectedVersion === 0
          ? await insertDeviceConfig(
              {
                deviceUuid: input.deviceUuid,
                configJson,
                updatedByUser: input.updatedByUser,
                updatedByDevice: input.updatedByDevice,
              },
              tx
            )
          : await updateDeviceConfigIfVersion(
              {
                deviceUuid: input.deviceUuid,
                expectedVersion: input.expectedVersion,
                configJson,
                updatedByUser: input.updatedByUser,
                updatedByDevice: input.updatedByDevice,
              },
              tx
            );

      if (!row) {
        const current = await findDeviceConfig(input.deviceUuid, tx);
        throw new AppError(
          409,
          "CONFIG_VERSION_CONFLICT",
          "Device config was updated by someone else. Reload and retry.",
          { currentVersion: current?.version ?? 0 }
        );
      }

      await insertDeviceConfigHistory(row, tx);
      await auditLogsService.record(
        "config.updated",
        {
          deviceUuid: input.deviceUuid,
          ...(input.updatedByUser ? { userId: input.updatedByUser } : {}),
          details: { version: row.version },
        },
        tx
      );
      return toRecord(row, input.deviceId);
    });
  }
}

export const deviceConfigService = new DeviceConfigService();
