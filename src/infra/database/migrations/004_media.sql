-- 004_media.sql — photos and voice clips on local disk.
-- Idempotent. Requires 003_device_config.sql.
-- File bytes live under MEDIA_DIR; this table stores only the asset id and metadata.

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
