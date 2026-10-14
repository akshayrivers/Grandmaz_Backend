import { query } from "../client.js";

export interface DeviceChallengeRow {
  id: string;
  device_id: string;
  challenge_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export async function insertDeviceChallenge(data: {
  deviceUuid: string;
  challengeHash: string;
  expiresAt: Date;
}): Promise<DeviceChallengeRow> {
  const res = await query<DeviceChallengeRow>(
    `INSERT INTO device_challenges (device_id, challenge_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, device_id, challenge_hash, expires_at, used_at, created_at`,
    [data.deviceUuid, data.challengeHash, data.expiresAt]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to store device challenge");
  }
  return res.rows[0];
}

export async function findDeviceChallenge(
  deviceUuid: string,
  challengeHash: string
): Promise<DeviceChallengeRow | null> {
  const res = await query<DeviceChallengeRow>(
    `SELECT id, device_id, challenge_hash, expires_at, used_at, created_at
     FROM device_challenges
     WHERE device_id = $1 AND challenge_hash = $2`,
    [deviceUuid, challengeHash]
  );
  return res.rows[0] ?? null;
}

/**
 * Atomically marks a challenge as used. Returns false if it was already used,
 * has expired, or a concurrent request consumed it first.
 */
export async function consumeDeviceChallenge(challengeId: string): Promise<boolean> {
  const res = await query(
    `UPDATE device_challenges
     SET used_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING id`,
    [challengeId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Removes expired/used challenges for a device so the table doesn't grow unbounded. */
export async function pruneDeviceChallenges(deviceUuid: string): Promise<void> {
  await query(
    `DELETE FROM device_challenges
     WHERE device_id = $1 AND (used_at IS NOT NULL OR expires_at < NOW() - INTERVAL '1 day')`,
    [deviceUuid]
  );
}

export interface DeviceTokenRow {
  id: string;
  device_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

export async function insertDeviceToken(data: {
  deviceUuid: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<DeviceTokenRow> {
  const res = await query<DeviceTokenRow>(
    `INSERT INTO device_tokens (device_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, device_id, token_hash, expires_at, revoked_at, last_used_at, created_at`,
    [data.deviceUuid, data.tokenHash, data.expiresAt]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to store device token");
  }
  return res.rows[0];
}

export interface AuthenticatedDeviceRow {
  token_id: string;
  id: string;
  device_id: string;
  status: string;
}

/** Resolves an unexpired, unrevoked token hash to its device; also stamps last_used_at. */
export async function findDeviceByActiveTokenHash(tokenHash: string): Promise<AuthenticatedDeviceRow | null> {
  const res = await query<AuthenticatedDeviceRow>(
    `UPDATE device_tokens t
     SET last_used_at = NOW()
     FROM devices d
     WHERE t.token_hash = $1
       AND t.revoked_at IS NULL
       AND t.expires_at > NOW()
       AND d.id = t.device_id
     RETURNING t.id AS token_id, d.id, d.device_id, d.status`,
    [tokenHash]
  );
  return res.rows[0] ?? null;
}
