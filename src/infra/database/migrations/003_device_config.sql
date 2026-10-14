-- 003_device_config.sql — Phase 1 versioned per-device config.
-- Idempotent. Requires 002_security.sql.
-- The caretaker PIN is not part of this document and must never be stored here.

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

CREATE INDEX IF NOT EXISTS idx_device_config_history_device
  ON device_config_history(device_id, version DESC);
