-- Full schema for a fresh database (= 001 + 002 + 003 + 004).
-- Keep in sync with src/infra/database/migrations/.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table (Caretakers and System Users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  phone_e164 VARCHAR(16),
  role VARCHAR(50) NOT NULL DEFAULT 'caretaker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Devices Table (Grandma's Launcher Devices)
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  key_algorithm VARCHAR(20) NOT NULL DEFAULT 'RSA'
    CONSTRAINT devices_key_algorithm_check CHECK (key_algorithm IN ('RSA', 'EC_P256')),
  display_name VARCHAR(100),
  fcm_token TEXT,
  fcm_token_updated_at TIMESTAMPTZ,
  device_metadata JSONB,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Device Caretakers Table (Junction Table between Users and Devices)
CREATE TABLE IF NOT EXISTS device_caretakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caretaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'caretaker'
    CONSTRAINT device_caretakers_role_check CHECK (role IN ('primary', 'caretaker', 'viewer')),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(caretaker_id, device_id)
);

-- 4. Caretaker Invitations Table (Magic Link + Pairing Code)
CREATE TABLE IF NOT EXISTS caretaker_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  pairing_code_hash CHAR(64),
  code_attempts INT NOT NULL DEFAULT 0,
  role VARCHAR(20) NOT NULL DEFAULT 'primary'
    CONSTRAINT caretaker_invitations_role_check CHECK (role IN ('primary', 'caretaker', 'viewer')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_device UUID REFERENCES devices(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Help Requests Table (Request Handling Module)
CREATE TABLE IF NOT EXISTS help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'general',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tasks Table (Remote Task Execution Control)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  command VARCHAR(255) NOT NULL,
  payload JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  result JSONB,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Audit Logs Table (Security & Event Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Device State Snapshots Table (Device state, battery, wifi, apps)
CREATE TABLE IF NOT EXISTS device_state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  battery_level INT,
  battery_status VARCHAR(50),
  wifi_ssid VARCHAR(255),
  storage_free_mb BIGINT,
  installed_apps JSONB,
  settings JSONB,
  snapshot_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Device Challenges (SHA-256 hash only; single use, 5-minute TTL)
CREATE TABLE IF NOT EXISTS device_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  challenge_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Device Tokens (SHA-256 hash only)
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Versioned device config (caretaker PIN is never stored here)
CREATE TABLE IF NOT EXISTS device_configs (
  device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >= 1),
  config JSONB NOT NULL,
  updated_by_user UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_device UUID REFERENCES devices(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT device_configs_actor_check CHECK (
    (updated_by_user IS NOT NULL) <> (updated_by_device IS NOT NULL)
  )
);

-- 12. History of committed config versions
CREATE TABLE IF NOT EXISTS device_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >= 1),
  config JSONB NOT NULL,
  updated_by_user UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_device UUID REFERENCES devices(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, version),
  CONSTRAINT device_config_history_actor_check CHECK (
    (updated_by_user IS NOT NULL) <> (updated_by_device IS NOT NULL)
  )
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_device_caretakers_caretaker ON device_caretakers(caretaker_id);
CREATE INDEX IF NOT EXISTS idx_device_caretakers_device ON device_caretakers(device_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_caretakers_one_primary
  ON device_caretakers(device_id) WHERE role = 'primary' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash ON caretaker_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_device ON caretaker_invitations(device_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_device ON help_requests(device_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_tasks_device ON tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_device_status ON tasks(device_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_device ON audit_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_device ON device_state_snapshots(device_id);
CREATE INDEX IF NOT EXISTS idx_device_challenges_device ON device_challenges(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_device ON device_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_config_history_device
  ON device_config_history(device_id, version DESC);

-- 13. Media metadata (bytes live on disk under MEDIA_DIR)
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('photo', 'audio')),
  content_type VARCHAR(100) NOT NULL,
  byte_size INT NOT NULL CHECK (byte_size > 0),
  duration_ms INT,
  storage_key TEXT NOT NULL,
  created_by_user UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_device UUID REFERENCES devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_assets_actor_check CHECK (
    (created_by_user IS NOT NULL) <> (created_by_device IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_media_assets_device ON media_assets(device_id);
