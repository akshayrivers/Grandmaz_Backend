import { query } from "../client.js";

export interface AuditLogRow {
  id: string;
  device_id: string | null;
  user_id: string | null;
  action: string;
  details: any;
  ip_address: string | null;
  created_at: Date;
}

export async function createAuditLog(data: {
  action: string;
  deviceId?: string | undefined;
  userId?: string | undefined;
  details?: any;
  ipAddress?: string | undefined;
}): Promise<AuditLogRow> {
  const res = await query<AuditLogRow>(
    `INSERT INTO audit_logs (device_id, user_id, action, details, ip_address)
     VALUES (
       CASE WHEN $1::varchar IS NOT NULL THEN (SELECT id FROM devices WHERE id::text = $1 OR device_id = $1 LIMIT 1) ELSE NULL END,
       $2, $3, $4, $5
     )
     RETURNING id, device_id, user_id, action, details, ip_address, created_at`,
    [
      data.deviceId || null,
      data.userId || null,
      data.action,
      data.details ? JSON.stringify(data.details) : null,
      data.ipAddress || null,
    ]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create audit log");
  }
  return res.rows[0];
}

export async function listAuditLogsByDeviceId(deviceId: string): Promise<AuditLogRow[]> {
  const res = await query<AuditLogRow>(
    `SELECT id, device_id, user_id, action, details, ip_address, created_at
     FROM audit_logs
     WHERE device_id IN (SELECT id FROM devices WHERE device_id = $1 OR id::text = $1)
     ORDER BY created_at DESC
     LIMIT 100`,
    [deviceId]
  );
  return res.rows;
}

export async function listAuditLogsByUserId(userId: string): Promise<AuditLogRow[]> {
  const res = await query<AuditLogRow>(
    `SELECT id, device_id, user_id, action, details, ip_address, created_at
     FROM audit_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
  return res.rows;
}
