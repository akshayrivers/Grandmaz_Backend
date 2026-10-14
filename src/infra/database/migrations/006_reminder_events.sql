CREATE TABLE IF NOT EXISTS reminder_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reminder_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('taken', 'snoozed', 'missed')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_events_device ON reminder_events(device_id, occurred_at DESC);
