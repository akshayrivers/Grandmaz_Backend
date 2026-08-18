import {
  createTask,
  findTaskById,
  listTasksByDeviceId,
  updateTaskStatus,
  type TaskRow,
} from "../../infra/database/queries/tasks.queries.js";
import type { TaskRecord, CreateTaskInput, UpdateTaskStatusInput } from "./command.types.js";

export class CommandsService {
  private mapRowToRecord(row: TaskRow): any {
    return {
      id: row.id,
      deviceId: row.device_id,
      device_id: row.device_id,
      createdBy: row.created_by,
      created_by: row.created_by,
      title: row.title,
      description: row.description,
      command: row.command,
      payload: row.payload,
      status: row.status,
      result: row.result,
      scheduledAt: row.scheduled_at,
      scheduled_at: row.scheduled_at,
      completedAt: row.completed_at,
      completed_at: row.completed_at,
      createdAt: row.created_at,
      created_at: row.created_at,
      updatedAt: row.updated_at,
      updated_at: row.updated_at,
    };
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const row = await createTask({
      deviceId: input.deviceId,
      title: input.title,
      command: input.command,
      description: input.description,
      payload: input.payload,
      createdBy: input.createdBy,
      scheduledAt: input.scheduledAt,
    });
    return this.mapRowToRecord(row);
  }

  async getById(id: string): Promise<TaskRecord> {
    const row = await findTaskById(id);
    if (!row) {
      throw new Error("Task not found");
    }
    return this.mapRowToRecord(row);
  }

  async listForDevice(deviceId: string, status?: string): Promise<TaskRecord[]> {
    const rows = await listTasksByDeviceId(deviceId, status);
    return rows.map((r) => this.mapRowToRecord(r));
  }

  async updateStatus(id: string, input: UpdateTaskStatusInput): Promise<TaskRecord> {
    const row = await updateTaskStatus(id, input.status, input.result);
    if (!row) {
      throw new Error("Task not found or failed to update");
    }
    return this.mapRowToRecord(row);
  }
}

export const commandsService = new CommandsService();
