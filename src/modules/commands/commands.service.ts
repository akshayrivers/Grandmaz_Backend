import {
  createTask,
  deliverPendingTasks,
  expireStaleTasks,
  findTaskById,
  listTasksByDeviceUuid,
  updateTaskStatus,
  type TaskRow,
} from "../../infra/database/queries/tasks.queries.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";
import { COMMAND_TITLES, type Command } from "./commands.schemas.js";
import type { CommandRecord, DeviceCommand } from "./command.types.js";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "expired"]);

function toCommandRecord(row: TaskRow): CommandRecord {
  return {
    id: row.id,
    deviceId: row.device_string_id,
    type: row.command,
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    status: row.status,
    result: row.result ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}

function toDeviceCommand(row: TaskRow): DeviceCommand {
  return {
    id: row.id,
    type: row.command,
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export class CommandsService {
  async create(input: {
    deviceUuid: string;
    command: Command;
    expiresInMinutes: number;
    createdBy: string;
  }): Promise<CommandRecord> {
    const { type, ...payload } = input.command;
    const row = await createTask({
      deviceUuid: input.deviceUuid,
      title: COMMAND_TITLES[type],
      command: type,
      payload,
      createdBy: input.createdBy,
      expiresAt: new Date(Date.now() + input.expiresInMinutes * 60 * 1000),
    });
    await auditLogsService.record("command.created", {
      deviceUuid: input.deviceUuid,
      userId: input.createdBy,
      details: { commandId: row.id, type },
    });
    return toCommandRecord(row);
  }

  async findDeviceUuidForTask(id: string): Promise<string | null> {
    const row = await findTaskById(id);
    return row?.device_id ?? null;
  }

  async getById(id: string, deviceUuid: string): Promise<CommandRecord> {
    const row = await findTaskById(id);
    if (!row || row.device_id !== deviceUuid) {
      throw new AppError(404, "COMMAND_NOT_FOUND", "Command not found");
    }
    return toCommandRecord(row);
  }

  async listForDevice(deviceUuid: string, status?: string): Promise<CommandRecord[]> {
    await expireStaleTasks(deviceUuid);
    const rows = await listTasksByDeviceUuid(deviceUuid, status);
    return rows.map(toCommandRecord);
  }

  /** Launcher poll: unexpired pending commands, marked delivered. */
  async deliverPending(deviceUuid: string): Promise<DeviceCommand[]> {
    await expireStaleTasks(deviceUuid);
    const rows = await deliverPendingTasks(deviceUuid);
    return rows.map(toDeviceCommand);
  }

  async updateStatusFromDevice(
    deviceUuid: string,
    id: string,
    status: "running" | "completed" | "failed",
    result?: Record<string, unknown>
  ): Promise<DeviceCommand> {
    const row = await findTaskById(id);
    if (!row || row.device_id !== deviceUuid) {
      throw new AppError(404, "COMMAND_NOT_FOUND", "Command not found");
    }
    if (TERMINAL_STATUSES.has(row.status)) {
      throw new AppError(409, "COMMAND_FINISHED", `Command is already ${row.status}`);
    }
    const updated = await updateTaskStatus(id, status, result);
    if (!updated) {
      throw new AppError(404, "COMMAND_NOT_FOUND", "Command not found");
    }
    return toDeviceCommand(updated);
  }
}

export const commandsService = new CommandsService();
