import { query } from "../client.js";

export type ReminderStatus = "taken" | "snoozed" | "missed";

export interface ReminderEventRow {
  id: string;
  device_id: string;
  device_string_id: string;
  reminder_id: string;
  status: ReminderStatus;
  occurred_at: Date;
}

export async function insertReminderEvent(data: {
  deviceUuid: string;
  reminderId: string;
  status: ReminderStatus;
}): Promise<ReminderEventRow> {
  const res = await query<ReminderEventRow>(
    `INSERT INTO reminder_events (device_id, reminder_id, status)
     VALUES ($1, $2, $3)
     RETURNING id, device_id, (SELECT device_id FROM devices WHERE id = $1) AS device_string_id,
       reminder_id, status, occurred_at`,
    [data.deviceUuid, data.reminderId, data.status]
  );
  const row = res.rows[0];
  if (!row) throw new Error("reminder insert returned no row");
  return row;
}

export async function listReminderEvents(deviceUuid: string): Promise<ReminderEventRow[]> {
  const res = await query<ReminderEventRow>(
    `SELECT e.id, e.device_id, d.device_id AS device_string_id, e.reminder_id, e.status, e.occurred_at
     FROM reminder_events e
     JOIN devices d ON d.id = e.device_id
     WHERE e.device_id = $1
     ORDER BY e.occurred_at DESC
     LIMIT 100`,
    [deviceUuid]
  );
  return res.rows;
}
