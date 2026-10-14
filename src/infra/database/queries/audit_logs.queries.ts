import { query, type QueryFn } from "../client.js";

export interface AuditLogRow {
  id: string;
  device_id: string | null;
  device_string_id: string | null;
  user_id: string | null;
  action: string;
  details: any;
  ip_address: string | null;
  created_at: Date;
}

export async function createAuditLog(
  data: {
    action: string;
    deviceUuid?: string | undefined;
    userId?: string | undefined;
    details?: unknown;
    ipAddress?: string | undefined;
  },
  q: QueryFn = query
): Promise<void> {
  await q(
    `INSERT INTO audit_logs (device_id, user_id, action, details, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      data.deviceUuid ?? null,
      data.userId ?? null,
      data.action,
      data.details === undefined ? null : JSON.stringify(data.details),
      data.ipAddress ?? null,
    ]
  );
}

export async function listAuditLogsByDeviceUuid(deviceUuid: string): Promise<AuditLogRow[]> {
  const res = await query<AuditLogRow>(
    `SELECT a.id, a.device_id, d.device_id AS device_string_id, a.user_id, a.action, a.details,
            a.ip_address, a.created_at
     FROM audit_logs a
     LEFT JOIN devices d ON d.id = a.device_id
     WHERE a.device_id = $1
     ORDER BY a.created_at DESC
     LIMIT 100`,
    [deviceUuid]
  );
  return res.rows;
}
