import { verifyFirebaseIdToken } from "../../infra/firebase/auth.js";
import type { AuthenticatedUser } from "../../infra/firebase/types.js";
import { query } from "../../infra/database/client.js";
import type { CaretakerProfile, AcceptInvitationResult } from "./auth.types.js";

export class AuthService {
  /**
   * Verifies Firebase ID Token and syncs user record into PostgreSQL users table.
   */
  async verifyAndSyncUser(firebaseUser: AuthenticatedUser): Promise<CaretakerProfile> {
    const { uid, email, name, picture } = firebaseUser;

    if (!email) {
      throw new Error("Firebase user must have an email address");
    }

    // Try finding existing user by firebase_uid or email
    const selectRes = await query(
      `SELECT id, firebase_uid, email, name, avatar_url, created_at, updated_at
       FROM users
       WHERE firebase_uid = $1 OR email = $2`,
      [uid, email]
    );

    if (selectRes.rows.length > 0) {
      const user = selectRes.rows[0];
      // Update firebase_uid, name, avatar if changed
      const updateRes = await query(
        `UPDATE users
         SET firebase_uid = $1, name = COALESCE($2, name), avatar_url = COALESCE($3, avatar_url), updated_at = NOW()
         WHERE id = $4
         RETURNING id, firebase_uid, email, name, avatar_url, created_at, updated_at`,
        [uid, name || null, picture || null, user.id]
      );
      const row = updateRes.rows[0];
      return {
        id: row.id,
        firebaseUid: row.firebase_uid,
        email: row.email,
        name: row.name,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Insert new user
    const insertRes = await query(
      `INSERT INTO users (firebase_uid, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, firebase_uid, email, name, avatar_url, created_at, updated_at`,
      [uid, email, name || null, picture || null]
    );

    const row = insertRes.rows[0];
    return {
      id: row.id,
      firebaseUid: row.firebase_uid,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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

    if (invitation.accepted_at) {
      throw new Error("Invitation has already been accepted");
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      throw new Error("Invitation has expired");
    }

    if (invitation.email && firebaseUser.email && invitation.email.toLowerCase() !== firebaseUser.email.toLowerCase()) {
      throw new Error("Invitation email does not match authenticated user email");
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
       SET accepted_at = NOW()
       WHERE id = $1`,
      [invitation.id]
    );

    return {
      message: "Invitation accepted successfully and caretaker linked to device.",
      user: caretaker,
      deviceId: invitation.device_id,
    };
  }
}

export const authService = new AuthService();
