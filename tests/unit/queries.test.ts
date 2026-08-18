import { describe, it, expect, vi, beforeEach } from "vitest";
import * as dbClient from "../../src/infra/database/client.js";
import {
  findUserById,
  upsertUser,
  findDeviceByStringId,
  linkCaretakerToDevice,
  createCaretakerInvitation,
  createHelpRequest,
  createTask,
  createAuditLog,
  createDeviceStateSnapshot,
} from "../../src/infra/database/queries/index.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
}));

describe("Database Query Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findUserById should return user record when found", async () => {
    vi.mocked(dbClient.query).mockResolvedValueOnce({
      rows: [
        {
          id: "u-1",
          firebase_uid: "fb-1",
          email: "test@example.com",
          name: "Test User",
          avatar_url: null,
          role: "caretaker",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    const user = await findUserById("u-1");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("test@example.com");
  });

  it("upsertUser should execute insert query", async () => {
    vi.mocked(dbClient.query).mockResolvedValueOnce({
      rows: [
        {
          id: "u-1",
          firebase_uid: "fb-1",
          email: "test@example.com",
          name: "Test User",
          avatar_url: null,
          role: "caretaker",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      rowCount: 1,
      command: "INSERT",
      oid: 0,
      fields: [],
    });

    const user = await upsertUser({
      firebaseUid: "fb-1",
      email: "test@example.com",
      name: "Test User",
    });
    expect(user.id).toBe("u-1");
    expect(dbClient.query).toHaveBeenCalledTimes(1);
  });

  it("findDeviceByStringId should return device row", async () => {
    vi.mocked(dbClient.query).mockResolvedValueOnce({
      rows: [
        {
          id: "d-uuid-1",
          device_id: "dev-123",
          public_key: "pk-abc",
          device_metadata: {},
          is_verified: true,
          status: "active",
          last_active_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    const device = await findDeviceByStringId("dev-123");
    expect(device?.device_id).toBe("dev-123");
  });

  it("linkCaretakerToDevice should link caretaker to device", async () => {
    // Mock device UUID resolution
    vi.mocked(dbClient.query).mockResolvedValueOnce({
      rows: [{ id: "d-uuid-1" }],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    vi.mocked(dbClient.query).mockResolvedValueOnce({
      rows: [
        {
          id: "dc-1",
          caretaker_id: "u-1",
          device_id: "d-uuid-1",
          role: "primary",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      rowCount: 1,
      command: "INSERT",
      oid: 0,
      fields: [],
    });

    const dc = await linkCaretakerToDevice({
      caretakerId: "u-1",
      deviceId: "d-uuid-1",
      role: "primary",
    });
    expect(dc.role).toBe("primary");
    expect(dbClient.query).toHaveBeenCalledTimes(2);
  });

  it("createTask should create remote command task", async () => {
    vi.mocked(dbClient.query).mockResolvedValueOnce({
      rows: [
        {
          id: "t-1",
          device_id: "d-uuid-1",
          created_by: "u-1",
          title: "Reboot Device",
          description: null,
          command: "reboot",
          payload: null,
          status: "pending",
          result: null,
          scheduled_at: new Date(),
          completed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      rowCount: 1,
      command: "INSERT",
      oid: 0,
      fields: [],
    });

    const task = await createTask({
      deviceId: "d-uuid-1",
      title: "Reboot Device",
      command: "reboot",
    });
    expect(task.command).toBe("reboot");
  });
});
