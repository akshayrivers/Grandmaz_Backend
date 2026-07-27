import { query } from "../client.js";

export interface TaskRow {
  id: string;
  device_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  command: string;
  payload: any;
  status: string;
  result: any;
  scheduled_at: Date;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function createTask(data: {
  deviceId: string;
  title: string;
  command: string;
  description?: string | undefined;
  payload?: any;
  createdBy?: string | undefined;
  scheduledAt?: Date | undefined;
}): Promise<TaskRow> {
  const res = await query<TaskRow>(
    `INSERT INTO tasks (device_id, title, command, description, payload, created_by, scheduled_at, status)
     VALUES (
       (SELECT id FROM devices WHERE id::text = $1 OR device_id = $1 LIMIT 1),
       $2, $3, $4, $5, $6, COALESCE($7, NOW()), 'pending'
     )
     RETURNING id, device_id, created_by, title, description, command, payload, status, result, scheduled_at, completed_at, created_at, updated_at`,
    [
      data.deviceId,
      data.title,
      data.command,
      data.description || null,
      data.payload ? JSON.stringify(data.payload) : null,
      data.createdBy || null,
      data.scheduledAt || null,
    ]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create task");
  }
  return res.rows[0];
}

export async function findTaskById(id: string): Promise<TaskRow | null> {
  const res = await query<TaskRow>(
    `SELECT id, device_id, created_by, title, description, command, payload, status, result, scheduled_at, completed_at, created_at, updated_at
     FROM tasks WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function listTasksByDeviceId(deviceId: string, status?: string): Promise<TaskRow[]> {
  const res = await query<TaskRow>(
    `SELECT id, device_id, created_by, title, description, command, payload, status, result, scheduled_at, completed_at, created_at, updated_at
     FROM tasks
      WHERE device_id IN (SELECT id FROM devices WHERE device_id = $1)
        AND ($2::varchar IS NULL OR status = $2)
     ORDER BY scheduled_at DESC`,
    [deviceId, status || null]
  );
  return res.rows;
}

export async function updateTaskStatus(
  id: string,
  status: string,
  result?: any
): Promise<TaskRow | null> {
  const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled';
  const res = await query<TaskRow>(
    `UPDATE tasks
     SET status = $2,
         result = COALESCE($3, result),
         completed_at = CASE WHEN $4 = true THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, device_id, created_by, title, description, command, payload, status, result, scheduled_at, completed_at, created_at, updated_at`,
    [id, status, result ? JSON.stringify(result) : null, isTerminal]
  );
  return res.rows[0] || null;
}
