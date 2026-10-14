export type AuditAction =
  | "caretaker.linked"
  | "caretaker.role_changed"
  | "caretaker.primary_transferred"
  | "caretaker.removed"
  | "invitation.created"
  | "invitation.revoked"
  | "command.created"
  | "config.updated"
  | "media.created"
  | "sos.started"
  | "sos.cancelled"
  | "sos.acknowledged";

export interface AuditLogRecord {
  id: string;
  deviceId: string | null;
  userId: string | null;
  action: string;
  details: unknown;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  deviceUuid?: string | undefined;
  userId?: string | undefined;
  details?: unknown;
  ipAddress?: string | undefined;
}
