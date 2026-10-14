import {
  addSosLocation,
  findSosEvent,
  insertSosEvent,
  listSosEvents,
  setSosStatus,
  type SosEventRow,
} from "../../infra/database/queries/sos.queries.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";

export interface SosEventRecord {
  id: string;
  deviceId: string;
  status: SosEventRow["status"];
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  createdAt: Date;
  updatedAt: Date;
  acknowledgedAt: Date | null;
}

function toRecord(row: SosEventRow): SosEventRecord {
  return {
    id: row.id,
    deviceId: row.device_string_id,
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

export class SosService {
  async start(deviceUuid: string, input: { latitude?: number | null; longitude?: number | null; accuracyM?: number | null }): Promise<SosEventRecord> {
    const hasFix = input.latitude != null && input.longitude != null;
    const row = await insertSosEvent({
      deviceUuid,
      latitude: hasFix ? input.latitude! : null,
      longitude: hasFix ? input.longitude! : null,
      accuracyM: input.accuracyM ?? null,
    });
    if (hasFix) {
      await addSosLocation(row.id, input.latitude!, input.longitude!, input.accuracyM ?? null);
    }
    await auditLogsService.record("sos.started", { deviceUuid, details: { eventId: row.id } });
    return toRecord((await findSosEvent(row.id)) ?? row);
  }

  async addLocation(deviceUuid: string, eventId: string, input: { latitude: number; longitude: number; accuracyM?: number | null }): Promise<SosEventRecord> {
    const existing = await findSosEvent(eventId);
    if (!existing || existing.device_id !== deviceUuid) {
      throw new AppError(404, "SOS_NOT_FOUND", "SOS alert not found");
    }
    if (existing.status !== "active") {
      throw new AppError(409, "SOS_CLOSED", "This SOS alert is no longer active");
    }
    const row = await addSosLocation(eventId, input.latitude, input.longitude, input.accuracyM ?? null);
    if (!row) throw new AppError(409, "SOS_CLOSED", "This SOS alert is no longer active");
    return toRecord(row);
  }

  async cancel(deviceUuid: string, eventId: string): Promise<SosEventRecord> {
    const existing = await findSosEvent(eventId);
    if (!existing || existing.device_id !== deviceUuid) {
      throw new AppError(404, "SOS_NOT_FOUND", "SOS alert not found");
    }
    const row = await setSosStatus(eventId, "cancelled", null);
    if (!row) throw new AppError(409, "SOS_CLOSED", "This SOS alert is no longer active");
    await auditLogsService.record("sos.cancelled", { deviceUuid, details: { eventId } });
    return toRecord(row);
  }

  async list(deviceUuid: string): Promise<SosEventRecord[]> {
    return (await listSosEvents(deviceUuid)).map(toRecord);
  }

  async acknowledge(deviceUuid: string, eventId: string, userId: string): Promise<SosEventRecord> {
    const existing = await findSosEvent(eventId);
    if (!existing || existing.device_id !== deviceUuid) {
      throw new AppError(404, "SOS_NOT_FOUND", "SOS alert not found");
    }
    const row = await setSosStatus(eventId, "acknowledged", userId);
    if (!row) throw new AppError(409, "SOS_CLOSED", "This SOS alert is no longer active");
    await auditLogsService.record("sos.acknowledged", { deviceUuid, userId, details: { eventId } });
    return toRecord(row);
  }

  async findDeviceUuid(eventId: string): Promise<string | null> {
    const row = await findSosEvent(eventId);
    return row?.device_id ?? null;
  }
}

export const sosService = new SosService();
