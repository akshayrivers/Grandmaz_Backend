import { query } from "../client.js";

export interface HelpRequestRow {
  id: string;
  device_id: string;
  device_string_id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const HELP_COLUMNS = `h.id, h.device_id, d.device_id AS device_string_id, h.title, h.description, h.type,
  h.status, h.resolved_by, h.resolved_at, h.created_at, h.updated_at`;

export async function createHelpRequest(data: {
  deviceUuid: string;
  title: string;
  description?: string | undefined;
  type: string;
}): Promise<HelpRequestRow> {
  const res = await query<HelpRequestRow>(
    `WITH h AS (
       INSERT INTO help_requests (device_id, title, description, type, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *
     )
     SELECT ${HELP_COLUMNS} FROM h INNER JOIN devices d ON d.id = h.device_id`,
    [data.deviceUuid, data.title, data.description ?? null, data.type]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create help request");
  }
  return res.rows[0];
}

export async function findHelpRequestById(id: string): Promise<HelpRequestRow | null> {
  const res = await query<HelpRequestRow>(
    `SELECT ${HELP_COLUMNS} FROM help_requests h INNER JOIN devices d ON d.id = h.device_id WHERE h.id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function listHelpRequestsByDeviceUuid(deviceUuid: string): Promise<HelpRequestRow[]> {
  const res = await query<HelpRequestRow>(
    `SELECT ${HELP_COLUMNS} FROM help_requests h INNER JOIN devices d ON d.id = h.device_id
     WHERE h.device_id = $1
     ORDER BY h.created_at DESC
     LIMIT 100`,
    [deviceUuid]
  );
  return res.rows;
}

export async function updateHelpRequestStatus(
  id: string,
  status: string,
  resolvedBy?: string
): Promise<HelpRequestRow | null> {
  const isResolved = status === "resolved";
  const res = await query<HelpRequestRow>(
    `WITH h AS (
       UPDATE help_requests
       SET status = $2,
           resolved_by = CASE WHEN $4 = true THEN $3::uuid ELSE resolved_by END,
           resolved_at = CASE WHEN $4 = true THEN NOW() ELSE resolved_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *
     )
     SELECT ${HELP_COLUMNS} FROM h INNER JOIN devices d ON d.id = h.device_id`,
    [id, status, resolvedBy ?? null, isResolved]
  );
  return res.rows[0] ?? null;
}
