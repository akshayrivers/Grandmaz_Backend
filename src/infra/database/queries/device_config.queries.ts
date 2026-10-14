import { query, type QueryFn } from "../client.js";

export interface DeviceConfigRow {
  device_id: string;
  version: number;
  config: unknown;
  updated_by_user: string | null;
  updated_by_device: string | null;
  updated_at: Date;
}

const CONFIG_COLUMNS = `device_id, version, config, updated_by_user, updated_by_device, updated_at`;

export async function findDeviceConfig(deviceUuid: string, q: QueryFn = query): Promise<DeviceConfigRow | null> {
  const res = await q<DeviceConfigRow>(
    `SELECT ${CONFIG_COLUMNS} FROM device_configs WHERE device_id = $1`,
    [deviceUuid]
  );
  return res.rows[0] ?? null;
}

/** Inserts version 1. Returns null when a row already exists (lost create). */
export async function insertDeviceConfig(
  data: {
    deviceUuid: string;
    configJson: string;
    updatedByUser: string | null;
    updatedByDevice: string | null;
  },
  q: QueryFn = query
): Promise<DeviceConfigRow | null> {
  const res = await q<DeviceConfigRow>(
    `INSERT INTO device_configs (device_id, version, config, updated_by_user, updated_by_device, updated_at)
     VALUES ($1, 1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (device_id) DO NOTHING
     RETURNING ${CONFIG_COLUMNS}`,
    [data.deviceUuid, data.configJson, data.updatedByUser, data.updatedByDevice]
  );
  return res.rows[0] ?? null;
}

/** Updates only when `expectedVersion` is still current. Returns null on a lost update. */
export async function updateDeviceConfigIfVersion(
  data: {
    deviceUuid: string;
    expectedVersion: number;
    configJson: string;
    updatedByUser: string | null;
    updatedByDevice: string | null;
  },
  q: QueryFn = query
): Promise<DeviceConfigRow | null> {
  const res = await q<DeviceConfigRow>(
    `UPDATE device_configs
     SET version = version + 1,
         config = $3::jsonb,
         updated_by_user = $4,
         updated_by_device = $5,
         updated_at = NOW()
     WHERE device_id = $1 AND version = $2
     RETURNING ${CONFIG_COLUMNS}`,
    [data.deviceUuid, data.expectedVersion, data.configJson, data.updatedByUser, data.updatedByDevice]
  );
  return res.rows[0] ?? null;
}

export async function insertDeviceConfigHistory(row: DeviceConfigRow, q: QueryFn = query): Promise<void> {
  const configJson = typeof row.config === "string" ? row.config : JSON.stringify(row.config);
  await q(
    `INSERT INTO device_config_history (device_id, version, config, updated_by_user, updated_by_device, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [row.device_id, row.version, configJson, row.updated_by_user, row.updated_by_device, row.updated_at]
  );
}
