import {
  createDeviceStateSnapshot,
  getLatestSnapshotByDeviceId,
  listSnapshotsByDeviceId,
  type DeviceStateSnapshotRow,
} from "../../infra/database/queries/device_state_snapshots.queries.js";
import { updateDeviceLastActive } from "../../infra/database/queries/devices.queries.js";
import type { DeviceStateSnapshotRecord, PostSnapshotInput } from "./shared-state.types.js";

export class SharedStateService {
  private mapRowToRecord(row: DeviceStateSnapshotRow): DeviceStateSnapshotRecord {
    return {
      id: row.id,
      deviceId: row.device_id,
      batteryLevel: row.battery_level,
      batteryStatus: row.battery_status,
      wifiSsid: row.wifi_ssid,
      storageFreeMb: row.storage_free_mb ? Number(row.storage_free_mb) : null,
      installedApps: row.installed_apps,
      settings: row.settings,
      snapshotData: row.snapshot_data,
      createdAt: row.created_at,
    };
  }

  async recordSnapshot(input: PostSnapshotInput): Promise<DeviceStateSnapshotRecord> {
    const row = await createDeviceStateSnapshot(input);
    await updateDeviceLastActive(input.deviceId);
    return this.mapRowToRecord(row);
  }

  async getLatest(deviceId: string): Promise<DeviceStateSnapshotRecord | null> {
    const row = await getLatestSnapshotByDeviceId(deviceId);
    return row ? this.mapRowToRecord(row) : null;
  }

  async getHistory(deviceId: string, limit = 20): Promise<DeviceStateSnapshotRecord[]> {
    const rows = await listSnapshotsByDeviceId(deviceId, limit);
    return rows.map((r) => this.mapRowToRecord(r));
  }
}

export const sharedStateService = new SharedStateService();
