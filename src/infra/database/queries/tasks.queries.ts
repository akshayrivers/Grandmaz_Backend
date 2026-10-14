import { query } from "../client.js";

export interface TaskRow {
  id: string;
  device_id: string;
  device_string_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  command: string;
  payload: any;
  status: string;
  result: any;
  scheduled_at: Date;
  expires_at: Date;
  delivered_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const TASK_COLUMNS = `t.id, t.device_id, d.device_id AS device_string_id, t.created_by, t.title, t.description,
  t.command, t.payload, t.status, t.result, t.scheduled_at, t.expires_at, t.delivered_at, t.completed_at,
  t.created_at, t.updated_at`;

export async function createTask(data: {
  deviceUuid: string;
  title: string;
  command: string;
  payload: Record<string, unknown>;
  createdBy?: string | undefined;
  expiresAt: Date;
}): Promise<TaskRow> {
  const res = await query<TaskRow>(
    `WITH t AS (
       INSERT INTO tasks (device_id, title, command, payload, created_by, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *
     )
     SELECT ${TASK_COLUMNS} FROM t INNER JOIN devices d ON d.id = t.device_id`,
    [data.deviceUuid, data.title, data.command, JSON.stringify(data.payload), data.createdBy ?? null, data.expiresAt]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to create task");
  }
  return res.rows[0];
}

export async function findTaskById(id: string): Promise<TaskRow | null> {
  const res = await query<TaskRow>(
    `SELECT ${TASK_COLUMNS} FROM tasks t INNER JOIN devices d ON d.id = t.device_id WHERE t.id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function listTasksByDeviceUuid(deviceUuid: string, status?: string): Promise<TaskRow[]> {
  const res = await query<TaskRow>(
    `SELECT ${TASK_COLUMNS} FROM tasks t INNER JOIN devices d ON d.id = t.device_id
     WHERE t.device_id = $1 AND ($2::varchar IS NULL OR t.status = $2)
     ORDER BY t.created_at DESC
     LIMIT 100`,
    [deviceUuid, status ?? null]
  );
  return res.rows;
}

/** Moves pending tasks whose TTL has passed to `expired`. */
export async function expireStaleTasks(deviceUuid: string): Promise<void> {
  await query(
    `UPDATE tasks SET status = 'expired', updated_at = NOW()
     WHERE device_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
    [deviceUuid]
  );
}

/** Returns unexpired pending tasks (oldest first) and stamps delivered_at. */
export async function deliverPendingTasks(deviceUuid: string): Promise<TaskRow[]> {
  const res = await query<TaskRow>(
    `WITH t AS (
       UPDATE tasks SET delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()
       WHERE device_id = $1 AND status = 'pending' AND expires_at > NOW()
       RETURNING *
     )
     SELECT ${TASK_COLUMNS} FROM t INNER JOIN devices d ON d.id = t.device_id
     ORDER BY t.created_at ASC`,
    [deviceUuid]
  );
  return res.rows;
}

export async function updateTaskStatus(id: string, status: string, result?: unknown): Promise<TaskRow | null> {
  const isTerminal = status === "completed" || status === "failed" || status === "cancelled";
  const res = await query<TaskRow>(
    `WITH t AS (
       UPDATE tasks
       SET status = $2,
           result = COALESCE($3, result),
           completed_at = CASE WHEN $4 = true THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *
     )
     SELECT ${TASK_COLUMNS} FROM t INNER JOIN devices d ON d.id = t.device_id`,
    [id, status, result === undefined ? null : JSON.stringify(result), isTerminal]
  );
  return res.rows[0] ?? null;
}
