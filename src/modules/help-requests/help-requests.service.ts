import {
  createHelpRequest,
  findHelpRequestById,
  listHelpRequestsByDeviceUuid,
  updateHelpRequestStatus,
  type HelpRequestRow,
} from "../../infra/database/queries/help_requests.queries.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { HelpRequestRecord, CreateHelpRequestInput, ResolveHelpRequestInput } from "./help-requests.types.js";

function toHelpRequest(row: HelpRequestRow): HelpRequestRecord {
  return {
    id: row.id,
    deviceId: row.device_string_id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class HelpRequestsService {
  async create(deviceUuid: string, input: CreateHelpRequestInput): Promise<HelpRequestRecord> {
    const row = await createHelpRequest({ deviceUuid, ...input });
    return toHelpRequest(row);
  }

  async findDeviceUuidForRequest(id: string): Promise<string | null> {
    const row = await findHelpRequestById(id);
    return row?.device_id ?? null;
  }

  async listForDevice(deviceUuid: string): Promise<HelpRequestRecord[]> {
    const rows = await listHelpRequestsByDeviceUuid(deviceUuid);
    return rows.map(toHelpRequest);
  }

  async updateStatus(id: string, deviceUuid: string, input: ResolveHelpRequestInput): Promise<HelpRequestRecord> {
    const existing = await findHelpRequestById(id);
    if (!existing || existing.device_id !== deviceUuid) {
      throw new AppError(404, "HELP_REQUEST_NOT_FOUND", "Help request not found");
    }
    const row = await updateHelpRequestStatus(id, input.status, input.resolvedBy);
    if (!row) {
      throw new AppError(404, "HELP_REQUEST_NOT_FOUND", "Help request not found");
    }
    return toHelpRequest(row);
  }
}

export const helpRequestsService = new HelpRequestsService();
