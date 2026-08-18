import { query } from "../client.js";

export interface DeviceRow {
  id: string;
  device_id: string;
  public_key: string;
  device_metadata: any;
  is_verified: boolean;
  status: string;
  last_active_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function findDeviceById(id: string): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(
    `SELECT id, device_id, public_key, device_metadata, is_verified, status, last_active_at, created_at, updated_at
     FROM devices WHERE id::text = $1 OR device_id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function findDeviceByStringId(deviceId: string): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(
    `SELECT id, device_id, public_key, device_metadata, is_verified, status, last_active_at, created_at, updated_at
     FROM devices WHERE device_id = $1 OR id::text = $1`,
    [deviceId]
  );
  return res.rows[0] || null;
}

export async function upsertDevice(data: {
  deviceId: string;
  publicKey: string;
  deviceMetadata?: any;
}): Promise<DeviceRow> {
  const res = await query<DeviceRow>(
    `INSERT INTO devices (device_id, public_key, device_metadata, is_verified, status)
     VALUES ($1, $2, $3, false, 'active')
     ON CONFLICT (device_id) DO UPDATE SET
       public_key = EXCLUDED.public_key,
       device_metadata = COALESCE(EXCLUDED.device_metadata, devices.device_metadata),
       updated_at = NOW()
     RETURNING id, device_id, public_key, device_metadata, is_verified, status, last_active_at, created_at, updated_at`,
    [data.deviceId, data.publicKey, data.deviceMetadata ? JSON.stringify(data.deviceMetadata) : null]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to upsert device");
  }
  return res.rows[0];
}

export async function markDeviceVerified(deviceId: string): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(
    `UPDATE devices
     SET is_verified = true, updated_at = NOW()
     WHERE device_id = $1 OR id::text = $1
     RETURNING id, device_id, public_key, device_metadata, is_verified, status, last_active_at, created_at, updated_at`,
    [deviceId]
  );
  return res.rows[0] || null;
}

export async function updateDeviceLastActive(deviceId: string): Promise<void> {
  await query(
    `UPDATE devices
     SET last_active_at = NOW(), updated_at = NOW()
     WHERE device_id = $1 OR id::text = $1`,
    [deviceId]
  );
}

export async function listDevicesForCaretaker(caretakerId: string): Promise<DeviceRow[]> {
  const res = await query<DeviceRow>(
    `SELECT d.id, d.device_id, d.public_key, d.device_metadata, d.is_verified, d.status, d.last_active_at, d.created_at, d.updated_at
     FROM devices d
     INNER JOIN device_caretakers dc ON dc.device_id = d.id
     WHERE dc.caretaker_id = $1 AND dc.status = 'active'
     ORDER BY d.created_at DESC`,
    [caretakerId]
  );
  return res.rows;
}
