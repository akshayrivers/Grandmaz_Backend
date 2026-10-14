export interface UserProfileResponse {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  phoneE164: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserProfileInput {
  name?: string | undefined;
  phoneE164?: string | null | undefined;
}
