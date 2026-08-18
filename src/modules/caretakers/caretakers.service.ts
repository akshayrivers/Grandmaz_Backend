import {
  getCaretakersByDeviceId,
  linkCaretakerToDevice,
  unlinkCaretakerFromDevice,
  updateCaretakerRole,
} from "../../infra/database/queries/device_caretakers.queries.js";
import { findUserByEmail } from "../../infra/database/queries/users.queries.js";
import type { CaretakerDetails, LinkCaretakerInput, UpdateCaretakerRoleInput } from "./caretakers.types.js";

export class CaretakersService {
  async getCaretakersForDevice(deviceId: string): Promise<any[]> {
    const list = await getCaretakersByDeviceId(deviceId);
    return list.map((item) => ({
      id: item.id,
      caretakerId: item.caretaker_id,
      caretaker_id: item.caretaker_id,
      deviceId: item.device_id,
      device_id: item.device_id,
      role: item.role,
      status: item.status,
      email: item.email,
      name: item.name,
      avatarUrl: item.avatar_url,
      avatar_url: item.avatar_url,
      createdAt: item.created_at,
      created_at: item.created_at,
      caretaker: {
        id: item.caretaker_id,
        email: item.email,
        name: item.name,
        avatarUrl: item.avatar_url,
        avatar_url: item.avatar_url,
        role: item.role,
      },
    }));
  }

  async linkCaretaker({ deviceId, email, role }: LinkCaretakerInput): Promise<CaretakerDetails> {
    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error(`No caretaker user found with email ${email}`);
    }

    await linkCaretakerToDevice({
      caretakerId: user.id,
      deviceId,
      role: role || "primary",
    });

    const caretakers = await this.getCaretakersForDevice(deviceId);
    const linked = caretakers.find((c) => c.caretakerId === user.id);
    if (!linked) {
      throw new Error("Failed to link caretaker to device");
    }
    return linked;
  }

  async removeCaretaker(caretakerId: string, deviceId: string): Promise<boolean> {
    return unlinkCaretakerFromDevice(caretakerId, deviceId);
  }

  async updateRole(
    caretakerId: string,
    deviceId: string,
    { role }: UpdateCaretakerRoleInput
  ): Promise<boolean> {
    const updated = await updateCaretakerRole(caretakerId, deviceId, role);
    return !!updated;
  }
}

export const caretakersService = new CaretakersService();
