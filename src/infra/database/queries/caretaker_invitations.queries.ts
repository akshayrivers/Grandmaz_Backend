import { query } from "../client.js";

export interface CaretakerInvitationRow {
  id: string;
  device_id: string;
  email: string;
  token: string;
  expires_at: Date;
  created_by: string | null;
  accepted_at: Date | null;
  created_at: Date;
}

export async function createCaretakerInvitation(data: {
  deviceId: string;
  email: string;
  token: string;
  expiresAt: Date;
  createdBy?: string;
}): Promise<CaretakerInvitationRow> {
  const res = await query<CaretakerInvitationRow>(
    `INSERT INTO caretaker_invitations (device_id, email, token, expires_at, created_by)
     VALUES (
       (SELECT id FROM devices WHERE id::text = $1 OR device_id = $1 LIMIT 1),
       $2, $3, $4, $5
     )
     RETURNING id, device_id, email, token, expires_at, created_by, accepted_at, created_at`,
    [data.deviceId, data.email.toLowerCase().trim(), data.token, data.expiresAt, data.createdBy || null]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create caretaker invitation");
  }
  return res.rows[0];
}

export async function findInvitationByToken(token: string): Promise<CaretakerInvitationRow | null> {
  const res = await query<CaretakerInvitationRow>(
    `SELECT id, device_id, email, token, expires_at, created_by, accepted_at, created_at
     FROM caretaker_invitations
     WHERE token = $1`,
    [token]
  );
  return res.rows[0] || null;
}

export async function markInvitationAccepted(id: string): Promise<CaretakerInvitationRow | null> {
  const res = await query<CaretakerInvitationRow>(
    `UPDATE caretaker_invitations
     SET accepted_at = NOW()
     WHERE id = $1
     RETURNING id, device_id, email, token, expires_at, created_by, accepted_at, created_at`,
    [id]
  );
  return res.rows[0] || null;
}

export async function listInvitationsByDeviceId(deviceId: string): Promise<CaretakerInvitationRow[]> {
  const res = await query<CaretakerInvitationRow>(
    `SELECT id, device_id, email, token, expires_at, created_by, accepted_at, created_at
     FROM caretaker_invitations
     WHERE device_id = $1 OR device_id IN (SELECT id FROM devices WHERE device_id = $1)
     ORDER BY created_at DESC`,
    [deviceId]
  );
  return res.rows;
}
