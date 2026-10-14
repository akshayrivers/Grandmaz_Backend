import {
  createDeviceStateSnapshot,
  getLatestSnapshotByDeviceUuid,
  listSnapshotsByDeviceUuid,
  type DeviceStateSnapshotRow,
} from "../../infra/database/queries/device_state_snapshots.queries.js";
import { updateDeviceLastActive } from "../../infra/database/queries/devices.queries.js";
import type { DeviceStateSnapshotRecord, PostSnapshotInput } from "./shared-state.types.js";

function toSnapshot(row: DeviceStateSnapshotRow): DeviceStateSnapshotRecord {
  return {
    id: row.id,
    deviceId: row.device_string_id,
    batteryLevel: row.battery_level,
    batteryStatus: row.battery_status,
    wifiSsid: row.wifi_ssid,
    storageFreeMb: row.storage_free_mb === null ? null : Number(row.storage_free_mb),
    installedApps: row.installed_apps,
    settings: row.settings,
    snapshotData: row.snapshot_data,
    createdAt: row.created_at,
  };
}

export class SharedStateService {
  async recordSnapshot(deviceUuid: string, input: PostSnapshotInput): Promise<DeviceStateSnapshotRecord> {
    const row = await createDeviceStateSnapshot({ deviceUuid, ...input });
    await updateDeviceLastActive(deviceUuid);
    return toSnapshot(row);
  }

  async getLatest(deviceUuid: string): Promise<DeviceStateSnapshotRecord | null> {
    const row = await getLatestSnapshotByDeviceUuid(deviceUuid);
    return row ? toSnapshot(row) : null;
  }

  async getHistory(deviceUuid: string, limit: number): Promise<DeviceStateSnapshotRecord[]> {
    const rows = await listSnapshotsByDeviceUuid(deviceUuid, limit);
    return rows.map(toSnapshot);
  }
}

export const sharedStateService = new SharedStateService();
