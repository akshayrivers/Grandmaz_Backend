export interface AuditLogRecord {
  id: string;
  deviceId: string | null;
  userId: string | null;
  action: string;
  details: any;
  ipAddress: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  action: string;
  deviceId?: string | undefined;
  userId?: string | undefined;
  details?: any;
  ipAddress?: string | undefined;
}
