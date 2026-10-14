import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync, sign } from "crypto";
import { deviceService, parsePublicKey } from "../../src/modules/devices/device.service.js";
import { sha256Hex } from "../../src/shared/utils/crypto.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { queueRows, paramsOfCall, sqlOfCall } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const DEVICE_ID = "grandma-android-device-001";

function ecKeys() {
  return generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function rsaKeys() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function deviceRow(publicKey: string, keyAlgorithm: "EC_P256" | "RSA" = "EC_P256") {
  return {
    id: "dev-uuid-1",
    device_id: DEVICE_ID,
    public_key: publicKey,
    key_algorithm: keyAlgorithm,
    display_name: null,
    device_metadata: { model: "Pixel 6" },
    is_verified: false,
    status: "active",
    last_active_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

const CHALLENGE = "a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0";

function challengeRow(overrides: Partial<{ used_at: Date | null; expires_at: Date }> = {}) {
  return {
    id: "chal-1",
    device_id: "dev-uuid-1",
    challenge_hash: sha256Hex(CHALLENGE),
    expires_at: new Date(Date.now() + 60_000),
    used_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((err: AppError) => {
    expect(err.statusCode).toBe(statusCode);
    expect(err.code).toBe(code);
  });
}

describe("DeviceService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("parsePublicKey", () => {
    it("accepts EC P-256 PEM and bare base64 DER", () => {
      const { publicKey } = ecKeys();
      const pem = parsePublicKey(publicKey, "EC_P256").pem;
      const base64 = publicKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
      expect(parsePublicKey(base64, "EC_P256").pem).toBe(pem);
    });

    it("rejects a key that doesn't match the declared algorithm", () => {
      const { publicKey } = rsaKeys();
      expect(() => parsePublicKey(publicKey, "EC_P256")).toThrow(AppError);
    });

    it("rejects garbage", () => {
      expect(() => parsePublicKey("not a key", "RSA")).toThrow(AppError);
    });
  });

  describe("registerDevice", () => {
    it("registers a new EC device and stores only the challenge hash", async () => {
      const { publicKey } = ecKeys();
      queueRows([deviceRow(publicKey)], [], [challengeRow()]);

      const result = await deviceService.registerDevice({
        deviceId: DEVICE_ID,
        publicKey,
        keyAlgorithm: "EC_P256",
        deviceMetadata: { model: "Pixel 6" },
      });

      expect(result.created).toBe(true);
      expect(result.device.deviceId).toBe(DEVICE_ID);
      expect(result.device.keyAlgorithm).toBe("EC_P256");
      expect(result.device.challenge).toMatch(/^[0-9a-f]{64}$/);
      expect(sqlOfCall(0)).toContain("ON CONFLICT (device_id) DO NOTHING");
      const storedHash = paramsOfCall(2)[1];
      expect(storedHash).toBe(sha256Hex(result.device.challenge));
      expect(paramsOfCall(2)).not.toContain(result.device.challenge);
    });

    it("re-registering with the same key refreshes metadata without re-keying", async () => {
      const { publicKey } = ecKeys();
      queueRows([], [deviceRow(publicKey)], [deviceRow(publicKey)], [], [challengeRow()]);

      const result = await deviceService.registerDevice({ deviceId: DEVICE_ID, publicKey, keyAlgorithm: "EC_P256" });

      expect(result.created).toBe(false);
      expect(sqlOfCall(2)).not.toContain("public_key =");
    });

    it("rejects a different key for an existing deviceId with 409", async () => {
      const original = ecKeys();
      const attacker = ecKeys();
      queueRows([], [deviceRow(original.publicKey)]);

      await expectAppError(
        deviceService.registerDevice({ deviceId: DEVICE_ID, publicKey: attacker.publicKey, keyAlgorithm: "EC_P256" }),
        409,
        "DEVICE_KEY_MISMATCH"
      );
    });
  });

  describe("createChallenge", () => {
    it("returns 404 DEVICE_NOT_FOUND for an unknown device", async () => {
      queueRows([]);
      await expectAppError(deviceService.createChallenge(DEVICE_ID), 404, "DEVICE_NOT_FOUND");
    });
  });

  describe("verifySignature", () => {
    it("verifies an EC (SHA256withECDSA) signature, consumes the challenge and issues a hashed dt_ token", async () => {
      const { publicKey, privateKey } = ecKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), privateKey).toString("base64");
      queueRows([deviceRow(publicKey)], [challengeRow()], [{ id: "chal-1" }], [], [{ id: "tok-1" }]);

      const result = await deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature });

      expect(result.deviceToken.startsWith("dt_")).toBe(true);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
      expect(sqlOfCall(2)).toContain("used_at IS NULL AND expires_at > NOW()");
      expect(paramsOfCall(4)[1]).toBe(sha256Hex(result.deviceToken));
      expect(paramsOfCall(4)).not.toContain(result.deviceToken);
    });

    it("verifies a legacy RSA (SHA256withRSA) signature", async () => {
      const { publicKey, privateKey } = rsaKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), privateKey).toString("base64");
      queueRows([deviceRow(publicKey, "RSA")], [challengeRow()], [{ id: "chal-1" }], [], [{ id: "tok-1" }]);

      const result = await deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature });
      expect(result.deviceToken.startsWith("dt_")).toBe(true);
    });

    it("rejects a replayed (already used) challenge", async () => {
      const { publicKey, privateKey } = ecKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), privateKey).toString("base64");
      queueRows([deviceRow(publicKey)], [challengeRow({ used_at: new Date() })]);

      await expectAppError(
        deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature }),
        401,
        "CHALLENGE_USED"
      );
    });

    it("rejects when a concurrent request consumed the challenge first", async () => {
      const { publicKey, privateKey } = ecKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), privateKey).toString("base64");
      queueRows([deviceRow(publicKey)], [challengeRow()], []);

      await expectAppError(
        deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature }),
        401,
        "CHALLENGE_USED"
      );
    });

    it("rejects an expired challenge", async () => {
      const { publicKey, privateKey } = ecKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), privateKey).toString("base64");
      queueRows([deviceRow(publicKey)], [challengeRow({ expires_at: new Date(Date.now() - 1000) })]);

      await expectAppError(
        deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature }),
        401,
        "CHALLENGE_EXPIRED"
      );
    });

    it("rejects a challenge the server never issued", async () => {
      const { publicKey, privateKey } = ecKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), privateKey).toString("base64");
      queueRows([deviceRow(publicKey)], []);

      await expectAppError(
        deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature }),
        401,
        "CHALLENGE_INVALID"
      );
    });

    it("rejects a signature from a different key", async () => {
      const { publicKey } = ecKeys();
      const other = ecKeys();
      const signature = sign("sha256", Buffer.from(CHALLENGE, "utf-8"), other.privateKey).toString("base64");
      queueRows([deviceRow(publicKey)], [challengeRow()]);

      await expectAppError(
        deviceService.verifySignature({ deviceId: DEVICE_ID, challenge: CHALLENGE, signature }),
        401,
        "INVALID_SIGNATURE"
      );
    });
  });
});
