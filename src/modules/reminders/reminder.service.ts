import { insertReminderEvent, listReminderEvents, type ReminderEventRow, type ReminderStatus } from "../../infra/database/queries/reminder_events.queries.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";

export interface ReminderEventRecord {
  id: string;
  deviceId: string;
  reminderId: string;
  status: ReminderStatus;
  occurredAt: string;
}

function toRecord(row: ReminderEventRow): ReminderEventRecord {
  return {
    id: row.id,
    deviceId: row.device_string_id,
    reminderId: row.reminder_id,
    status: row.status,
    occurredAt: row.occurred_at.toISOString(),
  };
}

export class ReminderService {
  async report(deviceUuid: string, reminderId: string, status: ReminderStatus): Promise<ReminderEventRecord> {
    const row = await insertReminderEvent({ deviceUuid, reminderId, status });
    await auditLogsService.record("reminder.reported", {
      deviceUuid,
      details: { reminderId, status },
    });
    return toRecord(row);
  }

  async list(deviceUuid: string): Promise<ReminderEventRecord[]> {
    const rows = await listReminderEvents(deviceUuid);
    return rows.map(toRecord);
  }
}

export const reminderService = new ReminderService();
