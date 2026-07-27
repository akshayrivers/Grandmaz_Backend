export interface CaretakerProfile {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AcceptInvitationRequest {
  idToken: string;
  invitationToken: string;
}

export interface AcceptInvitationResult {
  message: string;
  user: CaretakerProfile;
  deviceId: string;
}
