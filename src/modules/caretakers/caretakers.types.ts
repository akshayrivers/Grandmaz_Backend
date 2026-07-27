export interface CaretakerDetails {
  id: string;
  caretakerId: string;
  deviceId: string;
  role: string;
  status: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface LinkCaretakerInput {
  deviceId: string;
  email: string;
  role?: string | undefined;
}

export interface UpdateCaretakerRoleInput {
  role: string;
}
