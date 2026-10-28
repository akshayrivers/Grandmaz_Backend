import { query } from "../infra/database/client.js";
import { sha256Hex } from "../shared/utils/crypto.js";
import {
  LOCAL_CARETAKER_EMAIL,
  LOCAL_CARETAKER_UID,
  LOCAL_DEVICE_ID,
  LOCAL_DEVICE_TOKEN,
  LOCAL_PUBLIC_KEY,
} from "../config/local-flow.js";

/** Inserts one device, one caretaker, and a deterministic device token. No production database. */
export async function seedLocalFlow(): Promise<void> {
  const user = await query<{ id: string }>(
    `INSERT INTO users (firebase_uid, email, name, role)
     VALUES ($1, $2, 'Local caretaker', 'caretaker')
     ON CONFLICT (firebase_uid) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [LOCAL_CARETAKER_UID, LOCAL_CARETAKER_EMAIL]
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Local flow seed failed to store the caretaker");

  const device = await query<{ id: string }>(
    `INSERT INTO devices (device_id, public_key, is_verified, status, key_algorithm, display_name)
     VALUES ($1, $2, true, 'active', 'EC_P256', 'Local phone')
     ON CONFLICT (device_id) DO UPDATE
       SET is_verified = true, status = 'active', display_name = EXCLUDED.display_name, updated_at = NOW()
     RETURNING id`,
    [LOCAL_DEVICE_ID, LOCAL_PUBLIC_KEY]
  );
  const deviceUuid = device.rows[0]?.id;
  if (!deviceUuid) throw new Error("Local flow seed failed to store the device");

  await query(
    `INSERT INTO device_caretakers (caretaker_id, device_id, role, status)
     VALUES ($1, $2, 'primary', 'active')
     ON CONFLICT (caretaker_id, device_id) DO UPDATE
       SET role = 'primary', status = 'active', updated_at = NOW()`,
    [userId, deviceUuid]
  );

  await query(
    `INSERT INTO device_tokens (device_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')
     ON CONFLICT (token_hash) DO UPDATE
       SET expires_at = EXCLUDED.expires_at, revoked_at = NULL`,
    [deviceUuid, sha256Hex(LOCAL_DEVICE_TOKEN)]
  );
}
