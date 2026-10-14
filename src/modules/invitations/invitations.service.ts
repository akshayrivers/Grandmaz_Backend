import { randomUUID } from "crypto";
import { withTransaction } from "../../infra/database/client.js";
import {
  findInvitationById,
  findInvitationByTokenHash,
  incrementInvitationCodeAttempts,
  insertInvitation,
  listInvitationsByDeviceUuid,
  markInvitationAccepted,
  revokeInvitation,
  revokePendingDeviceInvitations,
  type CaretakerInvitationRow,
} from "../../infra/database/queries/caretaker_invitations.queries.js";
import {
  getCaretakersByDeviceUuid,
  hasActivePrimary,
  upsertCaretakerLink,
  type CaretakerRole,
} from "../../infra/database/queries/device_caretakers.queries.js";
import { findDeviceByIdentifier } from "../../infra/database/queries/devices.queries.js";
import { sendInvitationEmail } from "../../infra/email/index.js";
import type { AuthenticatedUser } from "../../infra/firebase/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  generatePairingCode,
  hashPairingCode,
  randomToken,
  sha256Hex,
  timingSafeEqualHex,
} from "../../shared/utils/crypto.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";
import { deviceDisplayName } from "../devices/device.service.js";
import { usersService } from "../users/users.service.js";
import type {
  AcceptInvitationResult,
  CreatedInvitation,
  DeviceInvitationStatus,
  InvitationPreview,
  InvitationRecord,
  InvitationStatus,
} from "./invitations.types.js";

export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

export function invitationStatus(row: CaretakerInvitationRow, now = new Date()): InvitationStatus {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (row.code_attempts >= MAX_CODE_ATTEMPTS) return "locked";
  if (new Date(row.expires_at) <= now) return "expired";
  return "pending";
}

type AcceptOutcome =
  | { kind: "ok"; deviceId: string; deviceUuid: string; role: CaretakerRole; invitationId: string }
  | { kind: "error"; error: AppError };

export class InvitationsService {
  private async create(input: {
    deviceUuid: string;
    deviceName: string;
    email: string;
    role: CaretakerRole;
    createdBy?: string | undefined;
    createdByDevice?: string | undefined;
  }): Promise<CreatedInvitation> {
    const id = randomUUID();
    const token = randomToken(32);
    const pairingCode = generatePairingCode();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const row = await insertInvitation({
      id,
      deviceUuid: input.deviceUuid,
      email: input.email,
      tokenHash: sha256Hex(token),
      pairingCodeHash: hashPairingCode(id, pairingCode),
      role: input.role,
      expiresAt,
      createdBy: input.createdBy,
      createdByDevice: input.createdByDevice,
    });

    await auditLogsService.record("invitation.created", {
      deviceUuid: input.deviceUuid,
      userId: input.createdBy,
      details: { invitationId: row.id, role: row.role, byDevice: Boolean(input.createdByDevice) },
    });

    try {
      await sendInvitationEmail({ toEmail: row.email, invitationToken: token, deviceName: input.deviceName });
    } catch (err) {
      // The invitation stays valid; the inviter can revoke and retry.
      console.error("Failed to send invitation email", err instanceof Error ? err.message : err);
    }

    return {
      invitationId: row.id,
      email: row.email,
      role: row.role,
      pairingCode,
      expiresAt: row.expires_at,
    };
  }

  /** Initial pairing from grandma's phone: allowed only while the device has no primary caretaker. */
  async createFromDevice(deviceUuid: string, email: string): Promise<Omit<CreatedInvitation, "email" | "role">> {
    const device = await findDeviceByIdentifier(deviceUuid);
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found");
    }
    if (await hasActivePrimary(device.id)) {
      throw new AppError(
        409,
        "PRIMARY_EXISTS",
        "This device already has a primary caretaker. Ask them to invite more caretakers from the web app."
      );
    }
    await revokePendingDeviceInvitations(device.id);
    const created = await this.create({
      deviceUuid: device.id,
      deviceName: deviceDisplayName(device),
      email,
      role: "primary",
      createdByDevice: device.id,
    });
    return { invitationId: created.invitationId, pairingCode: created.pairingCode, expiresAt: created.expiresAt };
  }

  /** Invitation created by the primary caretaker from the web app. */
  async createByCaretaker(input: {
    deviceUuid: string;
    email: string;
    role: "caretaker" | "viewer";
    createdBy: string;
  }): Promise<CreatedInvitation> {
    const device = await findDeviceByIdentifier(input.deviceUuid);
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found");
    }
    const cleanEmail = input.email.toLowerCase().trim();
    const caretakers = await getCaretakersByDeviceUuid(device.id);
    if (caretakers.some((c) => c.email.toLowerCase() === cleanEmail)) {
      throw new AppError(409, "ALREADY_LINKED", "This person is already a caretaker of this device");
    }
    return this.create({
      deviceUuid: device.id,
      deviceName: deviceDisplayName(device),
      email: cleanEmail,
      role: input.role,
      createdBy: input.createdBy,
    });
  }

  async getStatusForDevice(deviceUuid: string, invitationId: string): Promise<DeviceInvitationStatus> {
    const row = await findInvitationById(invitationId);
    if (!row || row.device_id !== deviceUuid) {
      throw new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found");
    }
    return {
      invitationId: row.id,
      status: invitationStatus(row),
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
    };
  }

  async preview(token: string): Promise<InvitationPreview> {
    const row = await findInvitationByTokenHash(sha256Hex(token));
    if (!row) {
      throw new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found");
    }
    const device = await findDeviceByIdentifier(row.device_id);
    return {
      email: row.email,
      deviceName: device ? deviceDisplayName(device) : "Grandma's phone",
      role: row.role,
      status: invitationStatus(row),
      expiresAt: row.expires_at,
    };
  }

  /**
   * Accepts an invitation for a signed-in caretaker. Requires a verified email equal to the
   * invited one and the correct pairing code. Wrong codes are counted (and committed) before
   * the error is raised; after MAX_CODE_ATTEMPTS the invitation is locked.
   */
  async accept(firebaseUser: AuthenticatedUser, token: string, pairingCode: string): Promise<AcceptInvitationResult> {
    if (firebaseUser.emailVerified !== true || !firebaseUser.email) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email address before accepting");
    }
    const user = await usersService.syncFromFirebase(firebaseUser);
    const signedInEmail = firebaseUser.email.toLowerCase().trim();

    const outcome = await withTransaction<AcceptOutcome>(async (tx) => {
      const inv = await findInvitationByTokenHash(sha256Hex(token), tx, true);
      if (!inv) {
        return { kind: "error", error: new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found") };
      }

      const status = invitationStatus(inv);
      if (status === "accepted") {
        return { kind: "error", error: new AppError(409, "INVITATION_USED", "This invitation was already used") };
      }
      if (status === "revoked") {
        return { kind: "error", error: new AppError(410, "INVITATION_REVOKED", "This invitation was cancelled") };
      }
      if (status === "locked") {
        return {
          kind: "error",
          error: new AppError(423, "INVITATION_LOCKED", "Too many wrong codes. Ask for a new invitation."),
        };
      }
      if (status === "expired") {
        return { kind: "error", error: new AppError(410, "INVITATION_EXPIRED", "This invitation has expired") };
      }

      if (inv.email.toLowerCase().trim() !== signedInEmail) {
        return {
          kind: "error",
          error: new AppError(403, "EMAIL_MISMATCH", "This invitation was sent to a different email address", {
            invitedEmail: inv.email,
            signedInEmail,
          }),
        };
      }

      const expectedHash = inv.pairing_code_hash ?? "";
      if (!timingSafeEqualHex(hashPairingCode(inv.id, pairingCode), expectedHash)) {
        const attempts = await incrementInvitationCodeAttempts(inv.id, tx);
        const attemptsRemaining = Math.max(0, MAX_CODE_ATTEMPTS - attempts);
        if (attemptsRemaining === 0) {
          return {
            kind: "error",
            error: new AppError(423, "INVITATION_LOCKED", "Too many wrong codes. Ask for a new invitation."),
          };
        }
        return {
          kind: "error",
          error: new AppError(400, "INVALID_PAIRING_CODE", "The pairing code is not correct", { attemptsRemaining }),
        };
      }

      // Serialise links per device so the "first caretaker becomes primary" rule is race-free.
      const deviceRes = await tx<{ id: string; device_id: string }>(
        `SELECT id, device_id FROM devices WHERE id = $1 FOR UPDATE`,
        [inv.device_id]
      );
      const device = deviceRes.rows[0];
      if (!device) {
        return { kind: "error", error: new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found") };
      }

      const primaryExists = await hasActivePrimary(device.id, tx);
      const role: CaretakerRole = !primaryExists ? "primary" : inv.role === "primary" ? "caretaker" : inv.role;
      const link = await upsertCaretakerLink({ caretakerId: user.id, deviceUuid: device.id, role }, tx);
      await markInvitationAccepted(inv.id, user.id, tx);
      await auditLogsService.record(
        "caretaker.linked",
        { deviceUuid: device.id, userId: user.id, details: { invitationId: inv.id, role: link.role } },
        tx
      );

      return { kind: "ok", deviceId: device.device_id, deviceUuid: device.id, role: link.role, invitationId: inv.id };
    });

    if (outcome.kind === "error") {
      throw outcome.error;
    }
    return { deviceId: outcome.deviceId, role: outcome.role };
  }

  async listForDevice(deviceUuid: string): Promise<InvitationRecord[]> {
    const rows = await listInvitationsByDeviceUuid(deviceUuid);
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      status: invitationStatus(row),
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    }));
  }

  async findDeviceUuidForInvitation(invitationId: string): Promise<string | null> {
    const row = await findInvitationById(invitationId);
    return row?.device_id ?? null;
  }

  async revoke(invitationId: string, deviceUuid: string, userId: string): Promise<void> {
    const row = await findInvitationById(invitationId);
    if (!row || row.device_id !== deviceUuid) {
      throw new AppError(404, "INVITATION_NOT_FOUND", "Invitation not found");
    }
    const revoked = await revokeInvitation(invitationId);
    if (!revoked) {
      throw new AppError(409, "INVITATION_NOT_PENDING", "Only pending invitations can be revoked");
    }
    await auditLogsService.record("invitation.revoked", { deviceUuid, userId, details: { invitationId } });
  }
}

export const invitationsService = new InvitationsService();
