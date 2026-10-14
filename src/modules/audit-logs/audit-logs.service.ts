import {
  createAuditLog,
  listAuditLogsByDeviceUuid,
  type AuditLogRow,
} from "../../infra/database/queries/audit_logs.queries.js";
import type { QueryFn } from "../../infra/database/client.js";
import type { AuditAction, AuditLogRecord, CreateAuditLogInput } from "./audit-logs.types.js";

export class AuditLogsService {
  private mapRowToRecord(row: AuditLogRow): AuditLogRecord {
    return {
      id: row.id,
      deviceId: row.device_string_id,
      userId: row.user_id,
      action: row.action,
      details: row.details,
      createdAt: row.created_at,
    };
  }

  /** Writes an audit entry; pass `q` to write inside the caller's transaction. */
  async record(action: AuditAction, input: CreateAuditLogInput, q?: QueryFn): Promise<void> {
    await createAuditLog({ action, ...input }, q);
  }

  async listForDevice(deviceUuid: string): Promise<AuditLogRecord[]> {
    const rows = await listAuditLogsByDeviceUuid(deviceUuid);
    return rows.map((r) => this.mapRowToRecord(r));
  }
}

export const auditLogsService = new AuditLogsService();
