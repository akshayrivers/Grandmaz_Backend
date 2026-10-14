-- 005_sos.sql — SOS events and live location points.
-- Idempotent. Location rows exist only while an alert is active or just after it.

CREATE TABLE IF NOT EXISTS sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'cancelled')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sos_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id UUID NOT NULL REFERENCES sos_events(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m INT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sos_events_device ON sos_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_locations_event ON sos_locations(sos_event_id, recorded_at DESC);
