import { query } from "../client.js";

export interface DeviceCaretakerRow {
  id: string;
  caretaker_id: string;
  device_id: string;
  role: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CaretakerWithDetailsRow {
  id: string;
  caretaker_id: string;
  device_id: string;
  role: string;
  status: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: Date;
}

export async function linkCaretakerToDevice(data: {
  caretakerId: string;
  deviceId: string;
  role?: string;
}): Promise<DeviceCaretakerRow> {
  const res = await query<DeviceCaretakerRow>(
    `INSERT INTO device_caretakers (caretaker_id, device_id, role, status)
     VALUES ($1, $2, COALESCE($3, 'primary'), 'active')
     ON CONFLICT (caretaker_id, device_id) DO UPDATE SET
       status = 'active',
       role = COALESCE($3, device_caretakers.role),
       updated_at = NOW()
     RETURNING id, caretaker_id, device_id, role, status, created_at, updated_at`,
    [data.caretakerId, data.deviceId, data.role || 'primary']
  );
  if (!res.rows[0]) {
    throw new Error("Failed to link caretaker to device");
  }
  return res.rows[0];
}

export async function unlinkCaretakerFromDevice(caretakerId: string, deviceId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM device_caretakers
     WHERE caretaker_id = $1 AND device_id IN (SELECT id FROM devices WHERE device_id = $2)`,
    [caretakerId, deviceId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getCaretakersByDeviceId(deviceId: string): Promise<CaretakerWithDetailsRow[]> {
  const res = await query<CaretakerWithDetailsRow>(
    `SELECT dc.id, dc.caretaker_id, dc.device_id, dc.role, dc.status,
            u.email, u.name, u.avatar_url, dc.created_at
     FROM device_caretakers dc
     INNER JOIN users u ON u.id = dc.caretaker_id
     WHERE dc.device_id IN (SELECT id FROM devices WHERE device_id = $1)
     ORDER BY dc.created_at ASC`,
    [deviceId]
  );
  return res.rows;
}

export async function updateCaretakerRole(
  caretakerId: string,
  deviceId: string,
  role: string
): Promise<DeviceCaretakerRow | null> {
  const res = await query<DeviceCaretakerRow>(
    `UPDATE device_caretakers
     SET role = $3, updated_at = NOW()
     WHERE caretaker_id = $1 AND device_id IN (SELECT id FROM devices WHERE device_id = $2)
     RETURNING id, caretaker_id, device_id, role, status, created_at, updated_at`,
    [caretakerId, deviceId, role]
  );
  return res.rows[0] || null;
}

export async function checkCaretakerAccess(caretakerId: string, deviceId: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM device_caretakers
     WHERE caretaker_id = $1 AND device_id IN (SELECT id FROM devices WHERE device_id = $2)
       AND status = 'active'`,
    [caretakerId, deviceId]
  );
  return res.rows.length > 0;
}
