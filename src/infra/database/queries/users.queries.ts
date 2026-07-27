import { query } from "../client.js";

export interface UserRow {
  id: string;
  firebase_uid: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `SELECT id, firebase_uid, email, name, avatar_url, role, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `SELECT id, firebase_uid, email, name, avatar_url, role, created_at, updated_at
     FROM users WHERE firebase_uid = $1`,
    [firebaseUid]
  );
  return res.rows[0] || null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `SELECT id, firebase_uid, email, name, avatar_url, role, created_at, updated_at
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return res.rows[0] || null;
}

export async function upsertUser(data: {
  firebaseUid: string;
  email: string;
  name?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  role?: string | undefined;
}): Promise<UserRow> {
  const res = await query<UserRow>(
    `INSERT INTO users (firebase_uid, email, name, avatar_url, role)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'caretaker'))
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email = EXCLUDED.email,
       name = COALESCE(EXCLUDED.name, users.name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       updated_at = NOW()
     RETURNING id, firebase_uid, email, name, avatar_url, role, created_at, updated_at`,
    [data.firebaseUid, data.email.toLowerCase().trim(), data.name || null, data.avatarUrl || null, data.role || 'caretaker']
  );
  if (!res.rows[0]) {
    throw new Error("Failed to upsert user");
  }
  return res.rows[0];
}

export async function updateUserProfile(
  id: string,
  data: { name?: string | null | undefined; avatarUrl?: string | null | undefined }
): Promise<UserRow | null> {
  const res = await query<UserRow>(
    `UPDATE users
     SET name = COALESCE($2, name),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, firebase_uid, email, name, avatar_url, role, created_at, updated_at`,
    [id, data.name || null, data.avatarUrl || null]
  );
  return res.rows[0] || null;
}
