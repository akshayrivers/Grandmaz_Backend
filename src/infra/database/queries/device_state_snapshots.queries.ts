import { query } from "../client.js";

export interface DeviceStateSnapshotRow {
  id: string;
  device_id: string;
  battery_level: number | null;
  battery_status: string | null;
  wifi_ssid: string | null;
  storage_free_mb: number | null;
  installed_apps: any;
  settings: any;
  snapshot_data: any;
  created_at: Date;
}

export async function createDeviceStateSnapshot(data: {
  deviceId: string;
  batteryLevel?: number | undefined;
  batteryStatus?: string | undefined;
  wifiSsid?: string | undefined;
  storageFreeMb?: number | undefined;
  installedApps?: any;
  settings?: any;
  snapshotData?: any;
}): Promise<DeviceStateSnapshotRow> {
  const res = await query<DeviceStateSnapshotRow>(
    `INSERT INTO device_state_snapshots (
       device_id, battery_level, battery_status, wifi_ssid, storage_free_mb, installed_apps, settings, snapshot_data
     )
     VALUES (
       (SELECT id FROM devices WHERE id::text = $1 OR device_id = $1 LIMIT 1),
       $2, $3, $4, $5, $6, $7, $8
     )
     RETURNING id, device_id, battery_level, battery_status, wifi_ssid, storage_free_mb, installed_apps, settings, snapshot_data, created_at`,
    [
      data.deviceId,
      data.batteryLevel ?? null,
      data.batteryStatus || null,
      data.wifiSsid || null,
      data.storageFreeMb ?? null,
      data.installedApps ? JSON.stringify(data.installedApps) : null,
      data.settings ? JSON.stringify(data.settings) : null,
      data.snapshotData ? JSON.stringify(data.snapshotData) : null,
    ]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create device state snapshot");
  }
  return res.rows[0];
}

export async function getLatestSnapshotByDeviceId(deviceId: string): Promise<DeviceStateSnapshotRow | null> {
  const res = await query<DeviceStateSnapshotRow>(
    `SELECT id, device_id, battery_level, battery_status, wifi_ssid, storage_free_mb, installed_apps, settings, snapshot_data, created_at
     FROM device_state_snapshots
     WHERE device_id IN (SELECT id FROM devices WHERE device_id = $1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [deviceId]
  );
  return res.rows[0] || null;
}

export async function listSnapshotsByDeviceId(deviceId: string, limit = 20): Promise<DeviceStateSnapshotRow[]> {
  const res = await query<DeviceStateSnapshotRow>(
    `SELECT id, device_id, battery_level, battery_status, wifi_ssid, storage_free_mb, installed_apps, settings, snapshot_data, created_at
     FROM device_state_snapshots
     WHERE device_id IN (SELECT id FROM devices WHERE device_id = $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [deviceId, limit]
  );
  return res.rows;
}
