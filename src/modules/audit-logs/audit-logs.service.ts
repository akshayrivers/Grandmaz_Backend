import {
  createAuditLog,
  listAuditLogsByDeviceId,
  listAuditLogsByUserId,
  type AuditLogRow,
} from "../../infra/database/queries/audit_logs.queries.js";
import type { AuditLogRecord, CreateAuditLogInput } from "./audit-logs.types.js";

export class AuditLogsService {
  private mapRowToRecord(row: AuditLogRow): any {
    return {
      id: row.id,
      deviceId: row.device_id,
      device_id: row.device_id,
      userId: row.user_id,
      user_id: row.user_id,
      action: row.action,
      details: row.details,
      ipAddress: row.ip_address,
      ip_address: row.ip_address,
      createdAt: row.created_at,
      created_at: row.created_at,
    };
  }

  async log(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const row = await createAuditLog(input);
    return this.mapRowToRecord(row);
  }

  async listForDevice(deviceId: string): Promise<AuditLogRecord[]> {
    const rows = await listAuditLogsByDeviceId(deviceId);
    return rows.map((r) => this.mapRowToRecord(r));
  }

  async listForUser(userId: string): Promise<AuditLogRecord[]> {
    const rows = await listAuditLogsByUserId(userId);
    return rows.map((r) => this.mapRowToRecord(r));
  }
}

export const auditLogsService = new AuditLogsService();
