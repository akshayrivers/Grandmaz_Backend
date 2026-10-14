import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { caretakersService } from "../../src/modules/caretakers/caretakers.service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { passThroughTransactions, queueRows, paramsOfCall, sqlOfCall } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

function link(caretakerId: string, role: string) {
  return { id: `link-${caretakerId}`, caretaker_id: caretakerId, device_id: "dev-uuid-1", role, status: "active" };
}

describe("primary caretaker uniqueness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    passThroughTransactions();
  });

  it("schema and migration enforce one active primary per device", () => {
    for (const path of ["src/infra/database/queries/schema.sql", "src/infra/database/migrations/002_security.sql"]) {
      const sql = readFileSync(path, "utf-8");
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_device_caretakers_one_primary\s+ON device_caretakers\(device_id\) WHERE role = 'primary' AND status = 'active'/
      );
      expect(sql).toContain("CHECK (role IN ('primary', 'caretaker', 'viewer'))");
    }
  });

  it("transferPrimary demotes the current primary before promoting the target, in one transaction", async () => {
    queueRows(
      [link("user-a", "primary")],
      [link("user-b", "caretaker")],
      [link("user-a", "caretaker")],
      [link("user-b", "primary")],
      [], // audit
      [] // list
    );

    await caretakersService.transferPrimary({ deviceUuid: "dev-uuid-1", actorId: "user-a", caretakerId: "user-b" });

    expect(paramsOfCall(2)).toEqual(["user-a", "dev-uuid-1", "caretaker"]);
    expect(paramsOfCall(3)).toEqual(["user-b", "dev-uuid-1", "primary"]);
    expect(paramsOfCall(4)[2]).toBe("caretaker.primary_transferred");
  });

  it("transferPrimary refuses when the actor is no longer primary", async () => {
    queueRows([link("user-a", "caretaker")]);
    await expect(
      caretakersService.transferPrimary({ deviceUuid: "dev-uuid-1", actorId: "user-a", caretakerId: "user-b" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("the primary cannot remove themselves", async () => {
    await expect(
      caretakersService.remove({ deviceUuid: "dev-uuid-1", actorId: "user-a", caretakerId: "user-a" })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("removing a caretaker writes an audit log", async () => {
    queueRows([link("user-b", "caretaker")], [{}], []);
    await caretakersService.remove({ deviceUuid: "dev-uuid-1", actorId: "user-a", caretakerId: "user-b" });
    expect(sqlOfCall(1)).toContain("DELETE FROM device_caretakers");
    expect(paramsOfCall(2)[2]).toBe("caretaker.removed");
  });
});
