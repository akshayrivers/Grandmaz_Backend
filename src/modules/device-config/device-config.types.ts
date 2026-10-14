import type { DeviceConfig } from "./device-config.schemas.js";

export interface DeviceConfigRecord {
  deviceId: string;
  version: number;
  config: DeviceConfig;
  updatedByUserId: string | null;
  updatedByDeviceId: string | null;
  updatedAt: Date | null;
}
