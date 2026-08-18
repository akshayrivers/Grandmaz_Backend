export interface DeviceMetadata {
  appVersion?: string | undefined;
  osVersion?: string | undefined;
  model?: string | undefined;
  manufacturer?: string | undefined;
  [key: string]: any;
}

export interface DeviceRecord {
  id: string;
  deviceId: string;
  publicKey: string;
  deviceMetadata: DeviceMetadata | null;
  isVerified: boolean;
  status: string;
  lastActiveAt?: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaretakerDeviceRecord {
  id: string;
  deviceId: string;
  deviceUuid: string;
  displayName: string;
  publicKey: string;
  deviceMetadata: DeviceMetadata | null;
  isVerified: boolean;
  status: string;
  lastActiveAt: Date | null;
  batteryLevel: number | null;
  batteryStatus: string | null;
  wifiSsid: string | null;
  caretakerRole: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterDeviceInput {
  deviceId: string;
  publicKey: string;
  deviceMetadata?: DeviceMetadata | undefined;
}

export interface CreateChallengeInput {
  deviceId: string;
}

export interface VerifyChallengeInput {
  deviceId: string;
  challenge: string;
  signature: string; // Base64 or Hex encoded
}

export interface VerifyChallengeResult {
  verified: boolean;
  is_verified?: boolean | undefined;
  isVerified?: boolean | undefined;
  message: string;
  deviceId: string;
}
