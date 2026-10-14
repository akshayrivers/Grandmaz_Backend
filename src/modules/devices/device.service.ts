import { createPublicKey, verify, type KeyObject } from "crypto";
import {
  findDeviceByIdentifier,
  findDeviceByStringId,
  insertDevice,
  listDevicesForCaretaker,
  markDeviceVerified,
  updateDeviceDisplayName,
  updateDeviceFcmToken,
  updateDeviceMetadata,
  type CaretakerDeviceRow,
  type DeviceRow,
  type KeyAlgorithm,
} from "../../infra/database/queries/devices.queries.js";
import {
  consumeDeviceChallenge,
  findDeviceChallenge,
  insertDeviceChallenge,
  insertDeviceToken,
  pruneDeviceChallenges,
} from "../../infra/database/queries/device_auth.queries.js";
import { getCaretakersByDeviceUuid } from "../../infra/database/queries/device_caretakers.queries.js";
import { AppError } from "../../shared/errors/app-error.js";
import { randomHex, randomToken, sha256Hex } from "../../shared/utils/crypto.js";
import { DEVICE_TOKEN_PREFIX } from "../../middleware/authenticate-device.js";
import type {
  CaretakerDeviceRecord,
  DeviceSelfRecord,
  IssuedChallenge,
  RegisterDeviceInput,
  RegisterDeviceResult,
  VerifyChallengeInput,
  VerifyChallengeResult,
} from "./device.types.js";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_REGEX = /^[0-9a-f]{64}$/;

/**
 * Parses a PEM SPKI or bare base64 DER SPKI public key, checks it matches `algorithm`
 * (EC must be P-256, RSA ≥ 2048 bits) and returns it with its canonical PEM form.
 */
export function parsePublicKey(key: string, algorithm: KeyAlgorithm): { keyObject: KeyObject; pem: string } {
  let keyObject: KeyObject;
  try {
    const cleaned = key.trim().replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
    if (cleaned.includes("-----BEGIN PUBLIC KEY-----")) {
      keyObject = createPublicKey({ key: cleaned, format: "pem" });
    } else {
      const der = Buffer.from(cleaned.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
      keyObject = createPublicKey({ key: der, format: "der", type: "spki" });
    }
  } catch {
    throw new AppError(400, "INVALID_PUBLIC_KEY", "Public key could not be parsed (expected SPKI PEM or base64 DER)");
  }

  const details = keyObject.asymmetricKeyDetails;
  if (algorithm === "EC_P256") {
    if (keyObject.asymmetricKeyType !== "ec" || details?.namedCurve !== "prime256v1") {
      throw new AppError(400, "INVALID_PUBLIC_KEY", "EC_P256 requires an EC public key on curve P-256");
    }
  } else if (keyObject.asymmetricKeyType !== "rsa" || (details?.modulusLength ?? 0) < 2048) {
    throw new AppError(400, "INVALID_PUBLIC_KEY", "RSA requires a public key of at least 2048 bits");
  }

  return { keyObject, pem: keyObject.export({ type: "spki", format: "pem" }).toString() };
}

/**
 * Verifies a base64 signature over the UTF-8 bytes of `message`.
 * EC_P256 → SHA256withECDSA (DER signature), RSA → SHA256withRSA (PKCS#1 v1.5).
 */
export function verifyDeviceSignature(
  publicKeyPem: string,
  algorithm: KeyAlgorithm,
  message: string,
  signatureBase64: string
): boolean {
  try {
    const { keyObject } = parsePublicKey(publicKeyPem, algorithm);
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length === 0) {
      return false;
    }
    const data = Buffer.from(message, "utf-8");
    if (algorithm === "EC_P256") {
      return verify("sha256", data, { key: keyObject, dsaEncoding: "der" }, signature);
    }
    return verify("sha256", data, keyObject, signature);
  } catch {
    return false;
  }
}

export function deviceDisplayName(row: Pick<DeviceRow, "display_name" | "device_metadata" | "device_id">): string {
  if (row.display_name) {
    return row.display_name;
  }
  const meta = row.device_metadata as { model?: unknown; manufacturer?: unknown } | null;
  if (meta && typeof meta.model === "string" && meta.model.length > 0) {
    return typeof meta.manufacturer === "string" && meta.manufacturer.length > 0
      ? `${meta.manufacturer} ${meta.model}`
      : meta.model;
  }
  return "Grandma's phone";
}

function toCaretakerDeviceRecord(row: CaretakerDeviceRow): CaretakerDeviceRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    displayName: deviceDisplayName(row),
    isVerified: row.is_verified,
    status: row.status,
    lastActiveAt: row.last_active_at ?? row.snapshot_created_at ?? null,
    batteryLevel: row.battery_level ?? null,
    batteryStatus: row.battery_status ?? null,
    wifiSsid: row.wifi_ssid ?? null,
    role: row.caretaker_role as CaretakerDeviceRecord["role"],
    deviceMetadata: row.device_metadata ?? null,
    createdAt: row.created_at,
  };
}

export class DeviceService {
  /**
   * Registers a new device. An existing deviceId is never re-keyed: the same key just
   * refreshes metadata; a different key is rejected with DEVICE_KEY_MISMATCH.
   */
  async registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceResult> {
    const { pem } = parsePublicKey(input.publicKey, input.keyAlgorithm);

    let created = true;
    let device = await insertDevice({
      deviceId: input.deviceId,
      publicKey: pem,
      keyAlgorithm: input.keyAlgorithm,
      deviceMetadata: input.deviceMetadata,
    });

    if (!device) {
      created = false;
      const existing = await findDeviceByStringId(input.deviceId);
      if (!existing) {
        throw new Error("Device insert conflicted but no row was found");
      }
      let existingPem: string | null = null;
      try {
        existingPem = parsePublicKey(existing.public_key, existing.key_algorithm).pem;
      } catch {
        existingPem = null;
      }
      if (existing.key_algorithm !== input.keyAlgorithm || existingPem !== pem) {
        throw new AppError(
          409,
          "DEVICE_KEY_MISMATCH",
          "This deviceId is registered with a different key. Generate a new deviceId and pair again."
        );
      }
      device = (await updateDeviceMetadata(existing.id, input.deviceMetadata)) ?? existing;
    }

    const challenge = await this.issueChallenge(device.id);
    return {
      created,
      device: {
        deviceId: device.device_id,
        isVerified: device.is_verified,
        keyAlgorithm: device.key_algorithm,
        challenge: challenge.challenge,
        challengeExpiresAt: challenge.expiresAt,
      },
    };
  }

  private async issueChallenge(deviceUuid: string): Promise<IssuedChallenge> {
    await pruneDeviceChallenges(deviceUuid);
    const challenge = randomHex(32);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await insertDeviceChallenge({ deviceUuid, challengeHash: sha256Hex(challenge), expiresAt });
    return { challenge, expiresAt };
  }

  async createChallenge(deviceId: string): Promise<IssuedChallenge> {
    const device = await findDeviceByStringId(deviceId);
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found. Register the device first.");
    }
    return this.issueChallenge(device.id);
  }

  /**
   * Verifies the signed challenge against the stored key and stored challenge (single use,
   * 5-minute TTL) and issues a 30-day device token. Only the token's SHA-256 is stored.
   */
  async verifySignature({ deviceId, challenge, signature }: VerifyChallengeInput): Promise<VerifyChallengeResult> {
    const device = await findDeviceByStringId(deviceId);
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found. Register the device first.");
    }
    if (!CHALLENGE_REGEX.test(challenge)) {
      throw new AppError(401, "CHALLENGE_INVALID", "Unknown challenge");
    }

    const stored = await findDeviceChallenge(device.id, sha256Hex(challenge));
    if (!stored) {
      throw new AppError(401, "CHALLENGE_INVALID", "Unknown challenge");
    }
    if (stored.used_at) {
      throw new AppError(401, "CHALLENGE_USED", "Challenge was already used");
    }
    if (new Date(stored.expires_at) <= new Date()) {
      throw new AppError(401, "CHALLENGE_EXPIRED", "Challenge has expired");
    }

    if (!verifyDeviceSignature(device.public_key, device.key_algorithm, challenge, signature)) {
      throw new AppError(401, "INVALID_SIGNATURE", "Signature verification failed");
    }

    // Atomic single-use: a concurrent verify of the same challenge loses here.
    if (!(await consumeDeviceChallenge(stored.id))) {
      throw new AppError(401, "CHALLENGE_USED", "Challenge was already used");
    }

    await markDeviceVerified(device.id);

    const deviceToken = randomToken(32, DEVICE_TOKEN_PREFIX);
    const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_MS);
    await insertDeviceToken({ deviceUuid: device.id, tokenHash: sha256Hex(deviceToken), expiresAt });

    return { deviceId: device.device_id, deviceToken, expiresAt };
  }

  async getMyDevices(caretakerId: string): Promise<CaretakerDeviceRecord[]> {
    const rows = await listDevicesForCaretaker(caretakerId);
    return rows.map(toCaretakerDeviceRecord);
  }

  async getDeviceForCaretaker(caretakerId: string, deviceUuid: string): Promise<CaretakerDeviceRecord> {
    const [row] = await listDevicesForCaretaker(caretakerId, deviceUuid);
    if (!row) {
      throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found");
    }
    return toCaretakerDeviceRecord(row);
  }

  async renameDevice(caretakerId: string, deviceUuid: string, displayName: string): Promise<CaretakerDeviceRecord> {
    await updateDeviceDisplayName(deviceUuid, displayName);
    return this.getDeviceForCaretaker(caretakerId, deviceUuid);
  }

  async setPushToken(deviceUuid: string, fcmToken: string): Promise<void> {
    await updateDeviceFcmToken(deviceUuid, fcmToken);
  }

  /** What the launcher may know about itself: caretaker names, roles and phone numbers for SOS. */
  async getSelf(deviceUuid: string): Promise<DeviceSelfRecord> {
    const device = await findDeviceByIdentifier(deviceUuid);
    if (!device) {
      throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found");
    }
    const caretakers = await getCaretakersByDeviceUuid(device.id);
    return {
      deviceId: device.device_id,
      isVerified: device.is_verified,
      displayName: device.display_name,
      caretakers: caretakers.map((c) => ({
        caretakerId: c.caretaker_id,
        name: c.name,
        role: c.role,
        phoneE164: c.phone_e164,
      })),
    };
  }
}

export const deviceService = new DeviceService();
