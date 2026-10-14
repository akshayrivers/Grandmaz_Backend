import { withTransaction } from "../../infra/database/client.js";
import {
  deleteCaretakerLink,
  findActiveLink,
  getCaretakersByDeviceUuid,
  updateCaretakerRole,
  type CaretakerWithDetailsRow,
} from "../../infra/database/queries/device_caretakers.queries.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";
import type { CaretakerDetails } from "./caretakers.types.js";

function toCaretaker(row: CaretakerWithDetailsRow, currentUserId: string): CaretakerDetails {
  return {
    caretakerId: row.caretaker_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    phoneE164: row.phone_e164,
    role: row.role,
    status: row.status,
    linkedAt: row.created_at,
    isMe: row.caretaker_id === currentUserId,
  };
}

export class CaretakersService {
  async listForDevice(deviceUuid: string, currentUserId: string): Promise<CaretakerDetails[]> {
    const rows = await getCaretakersByDeviceUuid(deviceUuid);
    return rows.map((row) => toCaretaker(row, currentUserId));
  }

  /** Primary changes another caretaker between `caretaker` and `viewer`. */
  async changeRole(input: {
    deviceUuid: string;
    actorId: string;
    caretakerId: string;
    role: "caretaker" | "viewer";
  }): Promise<CaretakerDetails> {
    if (input.caretakerId === input.actorId) {
      throw new AppError(409, "PRIMARY_CANNOT_DEMOTE_SELF", "Transfer the primary role to someone else first");
    }
    const link = await findActiveLink(input.caretakerId, input.deviceUuid);
    if (!link) {
      throw new AppError(404, "CARETAKER_NOT_FOUND", "Caretaker is not linked to this device");
    }
    await updateCaretakerRole(input.caretakerId, input.deviceUuid, input.role);
    await auditLogsService.record("caretaker.role_changed", {
      deviceUuid: input.deviceUuid,
      userId: input.actorId,
      details: { caretakerId: input.caretakerId, from: link.role, to: input.role },
    });
    const updated = (await this.listForDevice(input.deviceUuid, input.actorId)).find(
      (c) => c.caretakerId === input.caretakerId
    );
    if (!updated) {
      throw new AppError(404, "CARETAKER_NOT_FOUND", "Caretaker is not linked to this device");
    }
    return updated;
  }

  /** Moves the primary role from the current primary (actor) to another linked caretaker atomically. */
  async transferPrimary(input: { deviceUuid: string; actorId: string; caretakerId: string }): Promise<CaretakerDetails[]> {
    if (input.caretakerId === input.actorId) {
      throw new AppError(409, "ALREADY_PRIMARY", "You are already the primary caretaker");
    }

    await withTransaction(async (tx) => {
      const actor = await findActiveLink(input.actorId, input.deviceUuid, tx);
      if (!actor || actor.role !== "primary") {
        throw new AppError(403, "FORBIDDEN", "Only the primary caretaker can transfer the primary role");
      }
      const target = await findActiveLink(input.caretakerId, input.deviceUuid, tx);
      if (!target) {
        throw new AppError(404, "CARETAKER_NOT_FOUND", "Caretaker is not linked to this device");
      }
      // Demote first so the one-active-primary unique index is never violated.
      await updateCaretakerRole(input.actorId, input.deviceUuid, "caretaker", tx);
      await updateCaretakerRole(input.caretakerId, input.deviceUuid, "primary", tx);
      await auditLogsService.record(
        "caretaker.primary_transferred",
        {
          deviceUuid: input.deviceUuid,
          userId: input.actorId,
          details: { fromCaretakerId: input.actorId, toCaretakerId: input.caretakerId },
        },
        tx
      );
    });

    return this.listForDevice(input.deviceUuid, input.actorId);
  }

  async remove(input: { deviceUuid: string; actorId: string; caretakerId: string }): Promise<void> {
    if (input.caretakerId === input.actorId) {
      throw new AppError(409, "PRIMARY_CANNOT_LEAVE", "Transfer the primary role to someone else before leaving");
    }
    const link = await findActiveLink(input.caretakerId, input.deviceUuid);
    if (!link) {
      throw new AppError(404, "CARETAKER_NOT_FOUND", "Caretaker is not linked to this device");
    }
    await deleteCaretakerLink(input.caretakerId, input.deviceUuid);
    await auditLogsService.record("caretaker.removed", {
      deviceUuid: input.deviceUuid,
      userId: input.actorId,
      details: { caretakerId: input.caretakerId, role: link.role },
    });
  }
}

export const caretakersService = new CaretakersService();
