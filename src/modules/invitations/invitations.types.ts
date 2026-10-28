import type { CaretakerRole } from "../../infra/database/queries/device_caretakers.queries.js";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked" | "locked";

export interface CreatedInvitation {
  invitationId: string;
  email: string;
  role: CaretakerRole;
  /** Shown once to the inviter (on grandma's phone or to the primary); only its hash is stored. */
  pairingCode: string;
  expiresAt: Date;
  /**
   * Set only when the email was not delivered (no SMTP in local dev).
   * Path plus token, for the helper standing at the phone. Omitted after a real send.
   */
  acceptPath?: string;
}

export interface DeviceInvitationStatus {
  invitationId: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export interface InvitationPreview {
  email: string;
  deviceName: string;
  role: CaretakerRole;
  status: InvitationStatus;
  expiresAt: Date;
}

export interface InvitationRecord {
  id: string;
  email: string;
  role: CaretakerRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface AcceptInvitationResult {
  deviceId: string;
  role: CaretakerRole;
}
