import {
  createHelpRequest,
  findHelpRequestById,
  listHelpRequestsByDeviceId,
  updateHelpRequestStatus,
  type HelpRequestRow,
} from "../../infra/database/queries/help_requests.queries.js";
import type { HelpRequestRecord, CreateHelpRequestInput, ResolveHelpRequestInput } from "./help-requests.types.js";

export class HelpRequestsService {
  private mapRowToRecord(row: HelpRequestRow): HelpRequestRecord {
    return {
      id: row.id,
      deviceId: row.device_id,
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

  async create(input: CreateHelpRequestInput): Promise<HelpRequestRecord> {
    const row = await createHelpRequest(input);
    return this.mapRowToRecord(row);
  }

  async getById(id: string): Promise<HelpRequestRecord> {
    const row = await findHelpRequestById(id);
    if (!row) {
      throw new Error("Help request not found");
    }
    return this.mapRowToRecord(row);
  }

  async listForDevice(deviceId: string): Promise<HelpRequestRecord[]> {
    const rows = await listHelpRequestsByDeviceId(deviceId);
    return rows.map((r) => this.mapRowToRecord(r));
  }

  async updateStatus(id: string, input: ResolveHelpRequestInput): Promise<HelpRequestRecord> {
    const row = await updateHelpRequestStatus(id, input.status, input.resolvedBy);
    if (!row) {
      throw new Error("Help request not found");
    }
    return this.mapRowToRecord(row);
  }
}

export const helpRequestsService = new HelpRequestsService();
