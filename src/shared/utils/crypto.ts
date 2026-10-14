import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** URL-safe random token with an optional prefix (e.g. `dt_`). */
export function randomToken(bytes = 32, prefix = ""): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Uniformly random 6-digit numeric code, zero-padded. */
export function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Pairing codes are hashed with the invitation id so equal codes on different invitations differ. */
export function hashPairingCode(invitationId: string, code: string): string {
  return sha256Hex(`${invitationId}:${code}`);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
