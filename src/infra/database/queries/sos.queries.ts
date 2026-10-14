import { query, type QueryFn } from "../client.js";

export type SosStatus = "active" | "acknowledged" | "cancelled";

export interface SosEventRow {
  id: string;
  device_id: string;
  device_string_id: string;
  status: SosStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  created_at: Date;
  updated_at: Date;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
}

const COLUMNS = `e.id, e.device_id, d.device_id AS device_string_id, e.status, e.latitude, e.longitude,
  e.accuracy_m, e.created_at, e.updated_at, e.acknowledged_by, e.acknowledged_at`;

export async function insertSosEvent(data: {
  deviceUuid: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
}): Promise<SosEventRow> {
  const res = await query<SosEventRow>(
    `INSERT INTO sos_events (device_id, latitude, longitude, accuracy_m)
     VALUES ($1, $2, $3, $4)
     RETURNING id, device_id, (SELECT device_id FROM devices WHERE id = $1) AS device_string_id,
       status, latitude, longitude, accuracy_m, created_at, updated_at, acknowledged_by, acknowledged_at`,
    [data.deviceUuid, data.latitude, data.longitude, data.accuracyM]
  );
  const row = res.rows[0];
  if (!row) throw new Error("sos insert returned no row");
  return row;
}

export async function findSosEvent(id: string): Promise<SosEventRow | null> {
  const res = await query<SosEventRow>(
    `SELECT ${COLUMNS} FROM sos_events e INNER JOIN devices d ON d.id = e.device_id WHERE e.id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function listSosEvents(deviceUuid: string): Promise<SosEventRow[]> {
  const res = await query<SosEventRow>(
    `SELECT ${COLUMNS} FROM sos_events e INNER JOIN devices d ON d.id = e.device_id
     WHERE e.device_id = $1 ORDER BY e.created_at DESC LIMIT 20`,
    [deviceUuid]
  );
  return res.rows;
}

export async function addSosLocation(
  eventId: string,
  latitude: number,
  longitude: number,
  accuracyM: number | null
): Promise<SosEventRow | null> {
  await query(
    `INSERT INTO sos_locations (sos_event_id, latitude, longitude, accuracy_m) VALUES ($1, $2, $3, $4)`,
    [eventId, latitude, longitude, accuracyM]
  );
  const res = await query<SosEventRow>(
    `UPDATE sos_events e SET latitude = $2, longitude = $3, accuracy_m = $4, updated_at = NOW()
     FROM devices d
     WHERE e.id = $1 AND e.status = 'active' AND d.id = e.device_id
     RETURNING ${COLUMNS}`,
    [eventId, latitude, longitude, accuracyM]
  );
  return res.rows[0] ?? null;
}

export async function setSosStatus(
  eventId: string,
  status: Exclude<SosStatus, "active">,
  userId: string | null,
  q: QueryFn = query
): Promise<SosEventRow | null> {
  const res = await q<SosEventRow>(
    `UPDATE sos_events e SET status = $2, updated_at = NOW(),
       acknowledged_by = CASE WHEN $2 = 'acknowledged' THEN $3 ELSE acknowledged_by END,
       acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN NOW() ELSE acknowledged_at END
     FROM devices d
     WHERE e.id = $1 AND e.status = 'active' AND d.id = e.device_id
     RETURNING ${COLUMNS}`,
    [eventId, status, userId]
  );
  return res.rows[0] ?? null;
}
