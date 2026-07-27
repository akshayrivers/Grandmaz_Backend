export interface UserProfileResponse {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserProfileInput {
  name?: string | undefined;
  avatarUrl?: string | undefined;
}
