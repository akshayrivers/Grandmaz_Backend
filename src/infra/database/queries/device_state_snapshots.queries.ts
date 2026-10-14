import { query } from "../client.js";

export interface DeviceStateSnapshotRow {
  id: string;
  device_id: string;
  device_string_id: string;
  battery_level: number | null;
  battery_status: string | null;
  wifi_ssid: string | null;
  storage_free_mb: string | number | null;
  installed_apps: any;
  settings: any;
  snapshot_data: any;
  created_at: Date;
}

const SNAPSHOT_COLUMNS = `s.id, s.device_id, d.device_id AS device_string_id, s.battery_level, s.battery_status,
  s.wifi_ssid, s.storage_free_mb, s.installed_apps, s.settings, s.snapshot_data, s.created_at`;

export async function createDeviceStateSnapshot(data: {
  deviceUuid: string;
  batteryLevel?: number | undefined;
  batteryStatus?: string | undefined;
  wifiSsid?: string | undefined;
  storageFreeMb?: number | undefined;
  installedApps?: unknown;
  settings?: unknown;
  snapshotData?: unknown;
}): Promise<DeviceStateSnapshotRow> {
  const res = await query<DeviceStateSnapshotRow>(
    `WITH s AS (
       INSERT INTO device_state_snapshots (
         device_id, battery_level, battery_status, wifi_ssid, storage_free_mb, installed_apps, settings, snapshot_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *
     )
     SELECT ${SNAPSHOT_COLUMNS} FROM s INNER JOIN devices d ON d.id = s.device_id`,
    [
      data.deviceUuid,
      data.batteryLevel ?? null,
      data.batteryStatus ?? null,
      data.wifiSsid ?? null,
      data.storageFreeMb ?? null,
      data.installedApps === undefined ? null : JSON.stringify(data.installedApps),
      data.settings === undefined ? null : JSON.stringify(data.settings),
      data.snapshotData === undefined ? null : JSON.stringify(data.snapshotData),
    ]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create device state snapshot");
  }
  return res.rows[0];
}

export async function getLatestSnapshotByDeviceUuid(deviceUuid: string): Promise<DeviceStateSnapshotRow | null> {
  const res = await query<DeviceStateSnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS} FROM device_state_snapshots s INNER JOIN devices d ON d.id = s.device_id
     WHERE s.device_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [deviceUuid]
  );
  return res.rows[0] ?? null;
}

export async function listSnapshotsByDeviceUuid(deviceUuid: string, limit = 20): Promise<DeviceStateSnapshotRow[]> {
  const res = await query<DeviceStateSnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS} FROM device_state_snapshots s INNER JOIN devices d ON d.id = s.device_id
     WHERE s.device_id = $1
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [deviceUuid, limit]
  );
  return res.rows;
}
