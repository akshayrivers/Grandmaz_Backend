import type { KeyAlgorithm } from "../../infra/database/queries/devices.queries.js";
import type { CaretakerRole } from "../../infra/database/queries/device_caretakers.queries.js";

export interface DeviceMetadata {
  appVersion?: string | undefined;
  osVersion?: string | undefined;
  model?: string | undefined;
  manufacturer?: string | undefined;
  [key: string]: unknown;
}

export interface CaretakerDeviceRecord {
  id: string;
  deviceId: string;
  displayName: string;
  isVerified: boolean;
  status: string;
  lastActiveAt: Date | null;
  batteryLevel: number | null;
  batteryStatus: string | null;
  wifiSsid: string | null;
  role: CaretakerRole;
  deviceMetadata: DeviceMetadata | null;
  createdAt: Date;
}

export interface DeviceSelfRecord {
  deviceId: string;
  isVerified: boolean;
  displayName: string | null;
  caretakers: Array<{
    caretakerId: string;
    name: string | null;
    role: CaretakerRole;
    phoneE164: string | null;
  }>;
}

export interface RegisterDeviceInput {
  deviceId: string;
  publicKey: string;
  keyAlgorithm: KeyAlgorithm;
  deviceMetadata?: DeviceMetadata | undefined;
}

export interface RegisterDeviceResult {
  created: boolean;
  device: {
    deviceId: string;
    isVerified: boolean;
    keyAlgorithm: KeyAlgorithm;
    challenge: string;
    challengeExpiresAt: Date;
  };
}

export interface IssuedChallenge {
  challenge: string;
  expiresAt: Date;
}

export interface VerifyChallengeInput {
  deviceId: string;
  challenge: string;
  signature: string;
}

export interface VerifyChallengeResult {
  deviceId: string;
  deviceToken: string;
  expiresAt: Date;
}
