export interface CommandRecord {
  id: string;
  deviceId: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  result: unknown;
  createdBy: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
}

/** Shape the launcher receives from GET /api/device/commands. */
export interface DeviceCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: Date;
  expiresAt: Date;
}
