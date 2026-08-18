import { verifyFirebaseIdToken } from "../../infra/firebase/auth.js";
import type { AuthenticatedUser } from "../../infra/firebase/types.js";
import { query } from "../../infra/database/client.js";
import type { CaretakerProfile, AcceptInvitationResult } from "./auth.types.js";

/**
 * Auto-accepts any pending invitations sent to this email address:
 * creates an active device_caretakers link and stamps accepted_at.
 * Safe to call on every auth sync; it is a no-op when nothing is pending.
 */
export async function acceptPendingInvitationsForEmail(
  userId: string,
  email: string
): Promise<number> {
  const cleanEmail = email.toLowerCase().trim();

  const pendingInvs = await query(
    `SELECT id, device_id FROM caretaker_invitations
     WHERE LOWER(TRIM(email)) = $1
       AND accepted_at IS NULL
       AND (expires_at > NOW() OR expires_at IS NULL)`,
    [cleanEmail]
  );

  for (const inv of pendingInvs.rows) {
    await query(
      `INSERT INTO device_caretakers (caretaker_id, device_id, role, status)
       VALUES ($1, $2, 'primary', 'active')
       ON CONFLICT (caretaker_id, device_id)
       DO UPDATE SET status = 'active', updated_at = NOW()`,
      [userId, inv.device_id]
    );
    await query(
      `UPDATE caretaker_invitations SET accepted_at = NOW() WHERE id = $1`,
      [inv.id]
    );
  }

  return pendingInvs.rowCount ?? 0;
}

export class AuthService {
  /**
   * Verifies Firebase ID Token and syncs user record into PostgreSQL users table.
   * Also auto-accepts any pending invitations for the user's verified email so
   * that a caretaker always gets access to their devices, no matter which entry
   * point they use (invitation link or direct dashboard login).
   */
  async verifyAndSyncUser(firebaseUser: AuthenticatedUser): Promise<CaretakerProfile> {
    const { uid, email, name, picture } = firebaseUser;

    if (!email) {
      throw new Error("Firebase user must have an email address");
    }

    const cleanEmail = email.toLowerCase().trim();

    // Try finding existing user by firebase_uid or email
    const selectRes = await query(
      `SELECT id, firebase_uid, email, name, avatar_url, created_at, updated_at
       FROM users
       WHERE firebase_uid = $1 OR email = $2`,
      [uid, cleanEmail]
    );

    let row: any;

    if (selectRes.rows.length > 0) {
      const user = selectRes.rows[0];
      // Update firebase_uid, email, name, avatar if changed
      const updateRes = await query(
        `UPDATE users
         SET firebase_uid = $1, email = $2, name = COALESCE($3, name), avatar_url = COALESCE($4, avatar_url), updated_at = NOW()
         WHERE id = $5
         RETURNING id, firebase_uid, email, name, avatar_url, created_at, updated_at`,
        [uid, cleanEmail, name || null, picture || null, user.id]
      );
      row = updateRes.rows[0];
    } else {
      // Insert new user. Use ON CONFLICT so that if verify + accept-invitation
      // run concurrently (they do, right after Google login) neither throws a
      // unique constraint violation and strands the login flow.
      const insertRes = await query(
        `INSERT INTO users (firebase_uid, email, name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           firebase_uid = EXCLUDED.firebase_uid,
           name = COALESCE(EXCLUDED.name, users.name),
           avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
           updated_at = NOW()
         RETURNING id, firebase_uid, email, name, avatar_url, created_at, updated_at`,
        [uid, cleanEmail, name || null, picture || null]
      );
      row = insertRes.rows[0];
    }

    const userProfile: CaretakerProfile = {
      id: row.id,
      firebaseUid: row.firebase_uid,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Auto-link any pending invitations sent to this user's verified email address.
    // Runs for BOTH existing and brand-new users, so repeat logins also heal.
    try {
      await acceptPendingInvitationsForEmail(userProfile.id, userProfile.email);
    } catch (autoLinkErr) {
      console.warn("⚠️ Warning during auto-linking pending invitations:", autoLinkErr);
    }

    return userProfile;
  }

  /**
   * Validates invitation token, verifies Firebase token, upserts caretaker user,
   * and links caretaker user to the target device.
   */
  async acceptInvitation(idToken: string, invitationToken: string): Promise<AcceptInvitationResult> {
    // 1. Verify Firebase Token
    const firebaseUser = await verifyFirebaseIdToken(idToken);

    // 2. Validate Invitation Token
    const invRes = await query(
      `SELECT id, device_id, email, token, expires_at, accepted_at
       FROM caretaker_invitations
       WHERE token = $1`,
      [invitationToken]
    );

    if (invRes.rows.length === 0) {
      throw new Error("Invalid invitation token");
    }

    const invitation = invRes.rows[0];

    // Check expiration
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      throw new Error("Invitation has expired");
    }

    // Check email match if specified in invitation
    if (
      invitation.email &&
      firebaseUser.email &&
      invitation.email.toLowerCase().trim() !== firebaseUser.email.toLowerCase().trim()
    ) {
      throw new Error(
        `This invitation was sent to ${invitation.email}, but you signed in as ${firebaseUser.email}`
      );
    }

    // 3. Upsert Caretaker user
    const caretaker = await this.verifyAndSyncUser(firebaseUser);

    // 4. Link Caretaker user to Device
    await query(
      `INSERT INTO device_caretakers (caretaker_id, device_id, role, status)
       VALUES ($1, $2, 'primary', 'active')
       ON CONFLICT (caretaker_id, device_id)
       DO UPDATE SET status = 'active', updated_at = NOW()`,
      [caretaker.id, invitation.device_id]
    );

    // 5. Mark invitation accepted
    await query(
      `UPDATE caretaker_invitations
       SET accepted_at = COALESCE(accepted_at, NOW())
       WHERE id = $1`,
      [invitation.id]
    );

    // 6. Fetch device details
    const devRes = await query(
      `SELECT id, device_id, device_metadata, is_verified, status FROM devices WHERE id = $1`,
      [invitation.device_id]
    );
    const device = devRes.rows[0];

    return {
      message: "Invitation accepted successfully and caretaker linked to device.",
      user: caretaker,
      deviceId: device?.device_id || invitation.device_id,
      deviceUuid: invitation.device_id,
      deviceStringId: device?.device_id || invitation.device_id,
    };
  }
}

export const authService = new AuthService();
