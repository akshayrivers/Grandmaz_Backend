import { query } from "../client.js";

export interface UserRow {
  id: string;
  firebase_uid: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  phone_e164: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
}

const USER_COLUMNS = "id, firebase_uid, email, name, avatar_url, phone_e164, role, created_at, updated_at";

export async function findUserById(id: string): Promise<UserRow | null> {
  const res = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | null> {
  const res = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE firebase_uid = $1`, [firebaseUid]);
  return res.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const res = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [
    email.toLowerCase().trim(),
  ]);
  return res.rows[0] ?? null;
}

/** Updates the row owned by this Firebase uid (email may have changed in Firebase). */
export async function updateUserFromFirebase(data: {
  firebaseUid: string;
  email: string;
  avatarUrl?: string | null | undefined;
}): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `UPDATE users
     SET email = $2, avatar_url = COALESCE($3, avatar_url), updated_at = NOW()
     WHERE firebase_uid = $1
     RETURNING ${USER_COLUMNS}`,
    [data.firebaseUid, data.email.toLowerCase().trim(), data.avatarUrl ?? null]
  );
  return res.rows[0] ?? null;
}

/**
 * Inserts a user for a new Firebase identity. If a row with the same email exists it is
 * re-bound to this uid only when `emailVerified` is true; otherwise returns null.
 */
export async function insertUserFromFirebase(data: {
  firebaseUid: string;
  email: string;
  emailVerified: boolean;
  name?: string | null | undefined;
  avatarUrl?: string | null | undefined;
}): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `INSERT INTO users (firebase_uid, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       firebase_uid = EXCLUDED.firebase_uid,
       name = COALESCE(users.name, EXCLUDED.name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       updated_at = NOW()
     WHERE $5 = true
     RETURNING ${USER_COLUMNS}`,
    [data.firebaseUid, data.email.toLowerCase().trim(), data.name ?? null, data.avatarUrl ?? null, data.emailVerified]
  );
  return res.rows[0] ?? null;
}

/** `undefined` leaves a field unchanged; `null` clears phoneE164. */
export async function updateUserProfile(
  id: string,
  data: { name?: string | undefined; phoneE164?: string | null | undefined }
): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `UPDATE users
     SET name = COALESCE($2, name),
         phone_e164 = CASE WHEN $3 = true THEN $4 ELSE phone_e164 END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [id, data.name ?? null, data.phoneE164 !== undefined, data.phoneE164 ?? null]
  );
  return res.rows[0] ?? null;
}
