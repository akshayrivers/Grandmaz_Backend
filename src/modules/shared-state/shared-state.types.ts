export interface DeviceStateSnapshotRecord {
  id: string;
  deviceId: string;
  batteryLevel: number | null;
  batteryStatus: string | null;
  wifiSsid: string | null;
  storageFreeMb: number | null;
  installedApps: unknown;
  settings: unknown;
  snapshotData: unknown;
  createdAt: Date;
}

export interface PostSnapshotInput {
  batteryLevel?: number | undefined;
  batteryStatus?: string | undefined;
  wifiSsid?: string | undefined;
  storageFreeMb?: number | undefined;
  installedApps?: unknown;
  settings?: unknown;
  snapshotData?: unknown;
}
