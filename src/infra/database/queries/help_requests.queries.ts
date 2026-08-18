import { query } from "../client.js";

export interface HelpRequestRow {
  id: string;
  device_id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function createHelpRequest(data: {
  deviceId: string;
  title: string;
  description?: string | undefined;
  type?: string | undefined;
}): Promise<HelpRequestRow> {
  const res = await query<HelpRequestRow>(
    `INSERT INTO help_requests (device_id, title, description, type, status)
     VALUES (
       (SELECT id FROM devices WHERE id::text = $1 OR device_id = $1 LIMIT 1),
       $2, $3, COALESCE($4, 'general'), 'pending'
     )
     RETURNING id, device_id, title, description, type, status, resolved_by, resolved_at, created_at, updated_at`,
    [data.deviceId, data.title, data.description || null, data.type || 'general']
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create help request");
  }
  return res.rows[0];
}

export async function findHelpRequestById(id: string): Promise<HelpRequestRow | null> {
  const res = await query<HelpRequestRow>(
    `SELECT id, device_id, title, description, type, status, resolved_by, resolved_at, created_at, updated_at
     FROM help_requests WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function listHelpRequestsByDeviceId(deviceId: string): Promise<HelpRequestRow[]> {
  const res = await query<HelpRequestRow>(
    `SELECT id, device_id, title, description, type, status, resolved_by, resolved_at, created_at, updated_at
     FROM help_requests
     WHERE device_id IN (SELECT id FROM devices WHERE device_id = $1 OR id::text = $1)
     ORDER BY created_at DESC`,
    [deviceId]
  );
  return res.rows;
}

export async function updateHelpRequestStatus(
  id: string,
  status: string,
  resolvedBy?: string
): Promise<HelpRequestRow | null> {
  const isResolved = status === 'resolved';
  const res = await query<HelpRequestRow>(
    `UPDATE help_requests
     SET status = $2,
         resolved_by = CASE WHEN $3::uuid IS NOT NULL THEN $3::uuid ELSE resolved_by END,
         resolved_at = CASE WHEN $4 = true THEN NOW() ELSE resolved_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, device_id, title, description, type, status, resolved_by, resolved_at, created_at, updated_at`,
    [id, status, resolvedBy || null, isResolved]
  );
  return res.rows[0] || null;
}
