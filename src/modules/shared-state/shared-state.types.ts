export interface DeviceStateSnapshotRecord {
  id: string;
  deviceId: string;
  batteryLevel: number | null;
  batteryStatus: string | null;
  wifiSsid: string | null;
  storageFreeMb: number | null;
  installedApps: any;
  settings: any;
  snapshotData: any;
  createdAt: Date;
}

export interface PostSnapshotInput {
  deviceId: string;
  batteryLevel?: number | undefined;
  batteryStatus?: string | undefined;
  wifiSsid?: string | undefined;
  storageFreeMb?: number | undefined;
  installedApps?: any;
  settings?: any;
  snapshotData?: any;
}
