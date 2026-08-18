import { randomBytes } from "crypto";
import { query } from "../../infra/database/client.js";
import { sendInvitationEmail } from "../../infra/email/index.js";
import type {
  CreateInvitationInput,
  InvitationRecord,
  InvitationDetailsResponse,
} from "./invitations.types.js";

export class InvitationsService {
  /**
   * Creates a magic link invitation for a caretaker email attached to a specific device.
   * Sends the magic link email via Resend / Email infrastructure.
   */
  async createInvitation({
    deviceId,
    email,
    deviceName,
  }: CreateInvitationInput): Promise<{ invitation: InvitationRecord; inviteUrl: string }> {
    // Resolve string device_id (or UUID string) to target devices.id UUID
    const deviceRes = await query(
      `SELECT id FROM devices WHERE device_id = $1 OR id::text = $1`,
      [deviceId]
    );

    if (deviceRes.rows.length === 0) {
      throw new Error(`Device not found for identifier: ${deviceId}`);
    }

    const deviceUuid = deviceRes.rows[0].id;

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration

    const res = await query(
      `INSERT INTO caretaker_invitations (device_id, email, token, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, device_id, email, token, expires_at, accepted_at, created_at`,
      [deviceUuid, email.toLowerCase().trim(), token, expiresAt]
    );

    const row = res.rows[0];

    const invitation: InvitationRecord = {
      id: row.id,
      deviceId: row.device_id,
      email: row.email,
      token: row.token,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    };

    // Send email with magic link
    const { inviteUrl } = await sendInvitationEmail({
      toEmail: email,
      invitationToken: token,
      deviceName,
    });

    return { invitation, inviteUrl };
  }

  /**
   * Retrieves and validates invitation details by token.
   */
  async getInvitationDetails(token: string): Promise<InvitationDetailsResponse> {
    const res = await query(
      `SELECT id, device_id, email, token, expires_at, accepted_at
       FROM caretaker_invitations
       WHERE token = $1`,
      [token]
    );

    if (res.rows.length === 0) {
      throw new Error("Invitation not found");
    }

    const invitation = res.rows[0];

    if (invitation.accepted_at) {
      throw new Error("Invitation has already been accepted");
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      throw new Error("Invitation has expired");
    }

    return {
      valid: true,
      email: invitation.email,
      deviceId: invitation.device_id,
      expiresAt: invitation.expires_at,
    };
  }
}

export const invitationsService = new InvitationsService();
