import { randomBytes, verify } from "crypto";
import { query } from "../../infra/database/client.js";
import type {
  RegisterDeviceInput,
  DeviceRecord,
  VerifyChallengeInput,
  VerifyChallengeResult,
} from "./device.types.js";

export class DeviceService {
  /**
   * Registers a new device or updates an existing device's public key and metadata.
   */
  async registerDevice({
    deviceId,
    publicKey,
    deviceMetadata,
  }: RegisterDeviceInput): Promise<{ device: DeviceRecord; challenge: string }> {
    const res = await query(
      `INSERT INTO devices (device_id, public_key, device_metadata, is_verified, status)
       VALUES ($1, $2, $3, false, 'active')
       ON CONFLICT (device_id)
       DO UPDATE SET
         public_key = EXCLUDED.public_key,
         device_metadata = COALESCE(EXCLUDED.device_metadata, devices.device_metadata),
         updated_at = NOW()
       RETURNING id, device_id, public_key, device_metadata, is_verified, status, created_at, updated_at`,
      [deviceId, publicKey, deviceMetadata ? JSON.stringify(deviceMetadata) : null]
    );

    const row = res.rows[0];
    const device: DeviceRecord = {
      id: row.id,
      deviceId: row.device_id,
      publicKey: row.public_key,
      deviceMetadata: row.device_metadata,
      isVerified: row.is_verified,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const challenge = await this.createChallenge(deviceId);

    return { device, challenge };
  }

  /**
   * Generates a cryptographic challenge string for a registered device.
   */
  async createChallenge(deviceId: string): Promise<string> {
    const deviceRes = await query(
      `SELECT id FROM devices WHERE device_id = $1`,
      [deviceId]
    );

    if (deviceRes.rows.length === 0) {
      throw new Error("Device not found. Please register the device first.");
    }

    // Generate random 32-byte hex challenge
    const challenge = randomBytes(32).toString("hex");
    return challenge;
  }

  /**
   * Verifies the digital signature submitted by the launcher using the device's public key.
   */
  async verifySignature({
    deviceId,
    challenge,
    signature,
  }: VerifyChallengeInput): Promise<VerifyChallengeResult> {
    const deviceRes = await query(
      `SELECT id, device_id, public_key, is_verified FROM devices WHERE device_id = $1`,
      [deviceId]
    );

    if (deviceRes.rows.length === 0) {
      throw new Error("Device not found");
    }

    const device = deviceRes.rows[0];
    let isValidSignature = false;

    try {
      const signatureBuffer = Buffer.from(signature, "base64");
      const dataBuffer = Buffer.from(challenge, "utf-8");

      // Verify signature against public key
      isValidSignature = verify(
        "sha256",
        dataBuffer,
        device.public_key,
        signatureBuffer
      );
    } catch (err: any) {
      // Fallback check if signature was sent in hex format instead of base64
      try {
        const signatureHexBuffer = Buffer.from(signature, "hex");
        const dataBuffer = Buffer.from(challenge, "utf-8");
        isValidSignature = verify(
          "sha256",
          dataBuffer,
          device.public_key,
          signatureHexBuffer
        );
      } catch {
        isValidSignature = false;
      }
    }

    if (!isValidSignature) {
      return {
        verified: false,
        message: "Invalid signature challenge verification failed",
        deviceId,
      };
    }

    // Update device status to verified in Postgres
    await query(
      `UPDATE devices SET is_verified = true, updated_at = NOW() WHERE device_id = $1`,
      [deviceId]
    );

    return {
      verified: true,
      message: "Device challenge successfully verified and device marked as verified",
      deviceId,
    };
  }

  /**
   * Fetches a device record by deviceId.
   */
  async getDevice(deviceId: string): Promise<DeviceRecord> {
    const res = await query(
      `SELECT id, device_id, public_key, device_metadata, is_verified, status, created_at, updated_at
       FROM devices
       WHERE device_id = $1`,
      [deviceId]
    );

    if (res.rows.length === 0) {
      throw new Error("Device not found");
    }

    const row = res.rows[0];
    return {
      id: row.id,
      deviceId: row.device_id,
      publicKey: row.public_key,
      deviceMetadata: row.device_metadata,
      isVerified: row.is_verified,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const deviceService = new DeviceService();
