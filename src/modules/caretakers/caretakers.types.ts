import type { CaretakerRole } from "../../infra/database/queries/device_caretakers.queries.js";

export interface CaretakerDetails {
  caretakerId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  phoneE164: string | null;
  role: CaretakerRole;
  status: string;
  linkedAt: Date;
  isMe: boolean;
}
