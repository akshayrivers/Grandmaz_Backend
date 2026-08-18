import { randomBytes, verify } from "crypto";
import { query } from "../../infra/database/client.js";
import type {
  RegisterDeviceInput,
  DeviceRecord,
  CaretakerDeviceRecord,
  VerifyChallengeInput,
  VerifyChallengeResult,
} from "./device.types.js";

/**
 * Normalizes any public key string (handles escaped newlines, raw base64, CRLF) into standard PEM SPKI format.
 */
function normalizePublicKey(key: string): string {
  let cleaned = key.trim().replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  if (!cleaned.includes("-----BEGIN PUBLIC KEY-----")) {
    const raw = cleaned.replace(/[^A-Za-z0-9+/=]/g, "");
    cleaned = `-----BEGIN PUBLIC KEY-----\n${raw}\n-----END PUBLIC KEY-----`;
  }
  return cleaned;
}

export class DeviceService {
  /**
   * Registers a new device or updates an existing device's public key and metadata.
   */
  async registerDevice({
    deviceId,
    publicKey,
    deviceMetadata,
  }: RegisterDeviceInput): Promise<{ device: DeviceRecord; challenge: string }> {
    const normalizedKey = normalizePublicKey(publicKey);
    const res = await query(
      `INSERT INTO devices (device_id, public_key, device_metadata, is_verified, status, last_active_at)
       VALUES ($1, $2, $3, false, 'active', NOW())
       ON CONFLICT (device_id)
       DO UPDATE SET
         public_key = EXCLUDED.public_key,
         device_metadata = COALESCE(EXCLUDED.device_metadata, devices.device_metadata),
         last_active_at = NOW(),
         updated_at = NOW()
       RETURNING id, device_id, public_key, device_metadata, is_verified, status, last_active_at, created_at, updated_at`,
      [deviceId, normalizedKey, deviceMetadata ? JSON.stringify(deviceMetadata) : null]
    );

    const row = res.rows[0];
    const device: DeviceRecord = {
      id: row.id,
      deviceId: row.device_id,
      publicKey: row.public_key,
      deviceMetadata: row.device_metadata,
      isVerified: row.is_verified,
      status: row.status,
      lastActiveAt: row.last_active_at,
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
      `SELECT id FROM devices WHERE device_id = $1 OR id::text = $1`,
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
      `SELECT id, device_id, public_key, is_verified FROM devices WHERE device_id = $1 OR id::text = $1`,
      [deviceId]
    );

    if (deviceRes.rows.length === 0) {
      throw new Error("Device not found");
    }

    const device = deviceRes.rows[0];
    const normalizedKey = normalizePublicKey(device.public_key);
    let isValidSignature = false;

    try {
      const signatureBuffer = Buffer.from(signature, "base64");
      const dataBuffer = Buffer.from(challenge, "utf-8");

      // Verify signature against public key
      isValidSignature = verify(
        "sha256",
        dataBuffer,
        normalizedKey,
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
          normalizedKey,
          signatureHexBuffer
        );
      } catch {
        isValidSignature = false;
      }
    }

    if (!isValidSignature) {
      return {
        verified: false,
        is_verified: false,
        isVerified: false,
        message: "Invalid signature challenge verification failed",
        deviceId,
      };
    }

    // Update device status to verified in Postgres
    await query(
      `UPDATE devices SET is_verified = true, last_active_at = NOW(), updated_at = NOW() WHERE device_id = $1 OR id::text = $1`,
      [deviceId]
    );

    return {
      verified: true,
      is_verified: true,
      isVerified: true,
      message: "Device challenge successfully verified and device marked as verified",
      deviceId,
    };
  }

  /**
   * Fetches all devices linked to the authenticated caretaker user with their latest state snapshots.
   */
  async getMyDevices(firebaseUid: string): Promise<CaretakerDeviceRecord[]> {
    const userRes = await query(
      `SELECT id, email FROM users WHERE firebase_uid = $1`,
      [firebaseUid]
    );
    if (userRes.rows.length === 0) {
      return [];
    }
    const userId = userRes.rows[0].id;

    // Self-heal: if the user still has any pending invitations for their
    // verified email, auto-accept them so the device shows up on the dashboard
    // even when the caretaker skipped the invitation page.
    try {
      const { acceptPendingInvitationsForEmail } = await import("../auth/auth.service.js");
      await acceptPendingInvitationsForEmail(userId, userRes.rows[0].email);
    } catch (autoLinkErr) {
      console.warn("⚠️ Warning during dashboard auto-link of pending invitations:", autoLinkErr);
    }

    const res = await query(
      `SELECT d.id, d.device_id, d.public_key, d.device_metadata, d.is_verified, d.status,
              d.last_active_at, d.created_at, d.updated_at,
              dc.role as caretaker_role,
              s.battery_level, s.battery_status, s.wifi_ssid, s.created_at as snapshot_created_at
       FROM devices d
       INNER JOIN device_caretakers dc ON dc.device_id = d.id
       LEFT JOIN LATERAL (
         SELECT battery_level, battery_status, wifi_ssid, created_at
         FROM device_state_snapshots
         WHERE device_id = d.id
         ORDER BY created_at DESC
         LIMIT 1
       ) s ON true
       WHERE dc.caretaker_id = $1 AND dc.status = 'active'
       ORDER BY d.created_at DESC`,
      [userId]
    );

    return res.rows.map((row) => {
      const meta = row.device_metadata;
      const model = meta?.model ? `${meta.manufacturer ? meta.manufacturer + " " : ""}${meta.model}` : row.device_id;

      return {
        id: row.id,
        deviceId: row.device_id,
        deviceUuid: row.id,
        displayName: model,
        publicKey: row.public_key,
        deviceMetadata: row.device_metadata,
        isVerified: row.is_verified,
        status: row.status,
        lastActiveAt: row.last_active_at || row.snapshot_created_at || null,
        batteryLevel: row.battery_level ?? null,
        batteryStatus: row.battery_status ?? null,
        wifiSsid: row.wifi_ssid ?? null,
        caretakerRole: row.caretaker_role || "primary",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * Fetches a device record by deviceId or id UUID.
   */
  async getDevice(deviceId: string): Promise<DeviceRecord> {
    const res = await query(
      `SELECT id, device_id, public_key, device_metadata, is_verified, status, last_active_at, created_at, updated_at
       FROM devices
       WHERE device_id = $1 OR id::text = $1`,
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
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const deviceService = new DeviceService();
