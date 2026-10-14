import { query, type QueryFn } from "../client.js";

export type CaretakerRole = "primary" | "caretaker" | "viewer";

export interface DeviceCaretakerRow {
  id: string;
  caretaker_id: string;
  device_id: string;
  role: CaretakerRole;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CaretakerWithDetailsRow {
  id: string;
  caretaker_id: string;
  device_id: string;
  role: CaretakerRole;
  status: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  phone_e164: string | null;
  created_at: Date;
}

export interface CaretakerAccessRow {
  device_uuid: string;
  device_id: string;
  role: CaretakerRole;
}

const LINK_COLUMNS = "id, caretaker_id, device_id, role, status, created_at, updated_at";

/**
 * Returns the caller's active link to a device (looked up by string device_id or UUID),
 * or null when the caretaker is not actively linked.
 */
export async function getCaretakerAccess(
  caretakerId: string,
  deviceIdentifier: string
): Promise<CaretakerAccessRow | null> {
  const res = await query<CaretakerAccessRow>(
    `SELECT d.id AS device_uuid, d.device_id, dc.role
     FROM device_caretakers dc
     INNER JOIN devices d ON d.id = dc.device_id
     WHERE dc.caretaker_id = $1
       AND dc.status = 'active'
       AND (d.device_id = $2 OR d.id::text = $2)
     LIMIT 1`,
    [caretakerId, deviceIdentifier]
  );
  return res.rows[0] ?? null;
}

/** True when the caretaker has an active link to the device with one of `roles` (any role if omitted). */
export async function checkCaretakerAccess(
  caretakerId: string,
  deviceIdentifier: string,
  roles?: readonly CaretakerRole[]
): Promise<boolean> {
  const access = await getCaretakerAccess(caretakerId, deviceIdentifier);
  if (!access) {
    return false;
  }
  return !roles || roles.length === 0 || roles.includes(access.role);
}

export async function findActiveLink(
  caretakerId: string,
  deviceUuid: string,
  q: QueryFn = query
): Promise<DeviceCaretakerRow | null> {
  const res = await q<DeviceCaretakerRow>(
    `SELECT ${LINK_COLUMNS} FROM device_caretakers
     WHERE caretaker_id = $1 AND device_id = $2 AND status = 'active'`,
    [caretakerId, deviceUuid]
  );
  return res.rows[0] ?? null;
}

export async function hasActivePrimary(deviceUuid: string, q: QueryFn = query): Promise<boolean> {
  const res = await q(
    `SELECT 1 FROM device_caretakers WHERE device_id = $1 AND role = 'primary' AND status = 'active' LIMIT 1`,
    [deviceUuid]
  );
  return res.rows.length > 0;
}

/**
 * Creates or re-activates a link. An already-active link keeps its current role
 * (accepting another invitation never demotes an existing primary).
 */
export async function upsertCaretakerLink(
  data: { caretakerId: string; deviceUuid: string; role: CaretakerRole },
  q: QueryFn = query
): Promise<DeviceCaretakerRow> {
  const res = await q<DeviceCaretakerRow>(
    `INSERT INTO device_caretakers (caretaker_id, device_id, role, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (caretaker_id, device_id) DO UPDATE SET
       role = CASE WHEN device_caretakers.status = 'active' THEN device_caretakers.role ELSE EXCLUDED.role END,
       status = 'active',
       updated_at = NOW()
     RETURNING ${LINK_COLUMNS}`,
    [data.caretakerId, data.deviceUuid, data.role]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to link caretaker to device");
  }
  return res.rows[0];
}

export async function deleteCaretakerLink(
  caretakerId: string,
  deviceUuid: string,
  q: QueryFn = query
): Promise<boolean> {
  const res = await q(`DELETE FROM device_caretakers WHERE caretaker_id = $1 AND device_id = $2`, [
    caretakerId,
    deviceUuid,
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function getCaretakersByDeviceUuid(deviceUuid: string): Promise<CaretakerWithDetailsRow[]> {
  const res = await query<CaretakerWithDetailsRow>(
    `SELECT dc.id, dc.caretaker_id, dc.device_id, dc.role, dc.status,
            u.email, u.name, u.avatar_url, u.phone_e164, dc.created_at
     FROM device_caretakers dc
     INNER JOIN users u ON u.id = dc.caretaker_id
     WHERE dc.device_id = $1 AND dc.status = 'active'
     ORDER BY (dc.role = 'primary') DESC, dc.created_at ASC`,
    [deviceUuid]
  );
  return res.rows;
}

export async function updateCaretakerRole(
  caretakerId: string,
  deviceUuid: string,
  role: CaretakerRole,
  q: QueryFn = query
): Promise<DeviceCaretakerRow | null> {
  const res = await q<DeviceCaretakerRow>(
    `UPDATE device_caretakers
     SET role = $3, updated_at = NOW()
     WHERE caretaker_id = $1 AND device_id = $2 AND status = 'active'
     RETURNING ${LINK_COLUMNS}`,
    [caretakerId, deviceUuid, role]
  );
  return res.rows[0] ?? null;
}
