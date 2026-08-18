export interface InvitationRecord {
  id: string;
  deviceId: string;
  email: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface CreateInvitationInput {
  deviceId: string;
  email: string;
  deviceName?: string | undefined;
}

export interface InvitationDetailsResponse {
  valid: boolean;
  email: string;
  deviceId: string;
  expiresAt: Date;
  accepted?: boolean | undefined;
}
