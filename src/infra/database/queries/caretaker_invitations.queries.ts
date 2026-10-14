import { query, type QueryFn } from "../client.js";
import type { CaretakerRole } from "./device_caretakers.queries.js";

export interface CaretakerInvitationRow {
  id: string;
  device_id: string;
  email: string;
  token_hash: string;
  pairing_code_hash: string | null;
  code_attempts: number;
  role: CaretakerRole;
  expires_at: Date;
  created_by: string | null;
  created_by_device: string | null;
  accepted_by: string | null;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

const INVITATION_COLUMNS = `id, device_id, email, token_hash, pairing_code_hash, code_attempts, role,
  expires_at, created_by, created_by_device, accepted_by, accepted_at, revoked_at, created_at`;

export async function insertInvitation(
  data: {
    id: string;
    deviceUuid: string;
    email: string;
    tokenHash: string;
    pairingCodeHash: string;
    role: CaretakerRole;
    expiresAt: Date;
    createdBy?: string | undefined;
    createdByDevice?: string | undefined;
  },
  q: QueryFn = query
): Promise<CaretakerInvitationRow> {
  const res = await q<CaretakerInvitationRow>(
    `INSERT INTO caretaker_invitations
       (id, device_id, email, token_hash, pairing_code_hash, role, expires_at, created_by, created_by_device)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${INVITATION_COLUMNS}`,
    [
      data.id,
      data.deviceUuid,
      data.email.toLowerCase().trim(),
      data.tokenHash,
      data.pairingCodeHash,
      data.role,
      data.expiresAt,
      data.createdBy ?? null,
      data.createdByDevice ?? null,
    ]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create caretaker invitation");
  }
  return res.rows[0];
}

export async function findInvitationByTokenHash(
  tokenHash: string,
  q: QueryFn = query,
  forUpdate = false
): Promise<CaretakerInvitationRow | null> {
  const res = await q<CaretakerInvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM caretaker_invitations WHERE token_hash = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [tokenHash]
  );
  return res.rows[0] ?? null;
}

export async function findInvitationById(id: string): Promise<CaretakerInvitationRow | null> {
  const res = await query<CaretakerInvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM caretaker_invitations WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

/** Increments the wrong-code counter and returns the new count. */
export async function incrementInvitationCodeAttempts(id: string, q: QueryFn = query): Promise<number> {
  const res = await q<{ code_attempts: number }>(
    `UPDATE caretaker_invitations SET code_attempts = code_attempts + 1 WHERE id = $1 RETURNING code_attempts`,
    [id]
  );
  return res.rows[0]?.code_attempts ?? 0;
}

export async function markInvitationAccepted(id: string, acceptedBy: string, q: QueryFn = query): Promise<void> {
  await q(`UPDATE caretaker_invitations SET accepted_at = NOW(), accepted_by = $2 WHERE id = $1`, [id, acceptedBy]);
}

export async function revokeInvitation(id: string): Promise<boolean> {
  const res = await query(
    `UPDATE caretaker_invitations SET revoked_at = NOW()
     WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [id]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Revokes every still-pending invitation a device created itself (a new setup attempt replaces them). */
export async function revokePendingDeviceInvitations(deviceUuid: string): Promise<void> {
  await query(
    `UPDATE caretaker_invitations SET revoked_at = NOW()
     WHERE device_id = $1 AND created_by_device = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [deviceUuid]
  );
}

export async function listInvitationsByDeviceUuid(deviceUuid: string): Promise<CaretakerInvitationRow[]> {
  const res = await query<CaretakerInvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM caretaker_invitations
     WHERE device_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [deviceUuid]
  );
  return res.rows;
}
