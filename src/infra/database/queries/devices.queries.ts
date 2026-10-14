import { query } from "../client.js";

export type KeyAlgorithm = "RSA" | "EC_P256";

export interface DeviceRow {
  id: string;
  device_id: string;
  public_key: string;
  key_algorithm: KeyAlgorithm;
  display_name: string | null;
  device_metadata: any;
  is_verified: boolean;
  status: string;
  last_active_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const DEVICE_COLUMNS = `id, device_id, public_key, key_algorithm, display_name, device_metadata,
  is_verified, status, last_active_at, created_at, updated_at`;

/** Looks a device up by its string device_id or its UUID. */
export async function findDeviceByIdentifier(identifier: string): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM devices WHERE device_id = $1 OR id::text = $1 LIMIT 1`,
    [identifier]
  );
  return res.rows[0] ?? null;
}

export async function findDeviceByStringId(deviceId: string): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(`SELECT ${DEVICE_COLUMNS} FROM devices WHERE device_id = $1`, [deviceId]);
  return res.rows[0] ?? null;
}

/**
 * Inserts a new device. Never overwrites an existing row: returns null when the
 * device_id is already taken so the caller can compare keys.
 */
export async function insertDevice(data: {
  deviceId: string;
  publicKey: string;
  keyAlgorithm: KeyAlgorithm;
  deviceMetadata?: any;
}): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(
    `INSERT INTO devices (device_id, public_key, key_algorithm, device_metadata, is_verified, status, last_active_at)
     VALUES ($1, $2, $3, $4, false, 'active', NOW())
     ON CONFLICT (device_id) DO NOTHING
     RETURNING ${DEVICE_COLUMNS}`,
    [
      data.deviceId,
      data.publicKey,
      data.keyAlgorithm,
      data.deviceMetadata ? JSON.stringify(data.deviceMetadata) : null,
    ]
  );
  return res.rows[0] ?? null;
}

export async function updateDeviceMetadata(deviceUuid: string, deviceMetadata: any): Promise<DeviceRow | null> {
  const res = await query<DeviceRow>(
    `UPDATE devices
     SET device_metadata = COALESCE($2, device_metadata), last_active_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING ${DEVICE_COLUMNS}`,
    [deviceUuid, deviceMetadata ? JSON.stringify(deviceMetadata) : null]
  );
  return res.rows[0] ?? null;
}

export async function markDeviceVerified(deviceUuid: string): Promise<void> {
  await query(
    `UPDATE devices SET is_verified = true, last_active_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [deviceUuid]
  );
}

export async function updateDeviceLastActive(deviceUuid: string): Promise<void> {
  await query(`UPDATE devices SET last_active_at = NOW() WHERE id = $1`, [deviceUuid]);
}

export async function updateDeviceFcmToken(deviceUuid: string, fcmToken: string): Promise<void> {
  await query(
    `UPDATE devices SET fcm_token = $2, fcm_token_updated_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [deviceUuid, fcmToken]
  );
}

export async function updateDeviceDisplayName(deviceUuid: string, displayName: string): Promise<void> {
  await query(`UPDATE devices SET display_name = $2, updated_at = NOW() WHERE id = $1`, [
    deviceUuid,
    displayName,
  ]);
}

export interface CaretakerDeviceRow extends DeviceRow {
  caretaker_role: string;
  battery_level: number | null;
  battery_status: string | null;
  wifi_ssid: string | null;
  snapshot_created_at: Date | null;
}

/** Devices the caretaker is actively linked to, with their latest snapshot summary. */
export async function listDevicesForCaretaker(
  caretakerId: string,
  deviceUuid?: string
): Promise<CaretakerDeviceRow[]> {
  const res = await query<CaretakerDeviceRow>(
    `SELECT d.id, d.device_id, d.public_key, d.key_algorithm, d.display_name, d.device_metadata,
            d.is_verified, d.status, d.last_active_at, d.created_at, d.updated_at,
            dc.role AS caretaker_role,
            s.battery_level, s.battery_status, s.wifi_ssid, s.created_at AS snapshot_created_at
     FROM devices d
     INNER JOIN device_caretakers dc ON dc.device_id = d.id
     LEFT JOIN LATERAL (
       SELECT battery_level, battery_status, wifi_ssid, created_at
       FROM device_state_snapshots
       WHERE device_id = d.id
       ORDER BY created_at DESC
       LIMIT 1
     ) s ON true
     WHERE dc.caretaker_id = $1 AND dc.status = 'active'
       AND ($2::uuid IS NULL OR d.id = $2::uuid)
     ORDER BY d.created_at DESC`,
    [caretakerId, deviceUuid ?? null]
  );
  return res.rows;
}
