import { describe, it, expect, vi, beforeEach } from "vitest";
import { invitationsService, invitationStatus } from "../../src/modules/invitations/invitations.service.js";
import { sendInvitationEmail } from "../../src/infra/email/index.js";
import { hashPairingCode, sha256Hex } from "../../src/shared/utils/crypto.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import type { AuthenticatedUser } from "../../src/infra/firebase/types.js";
import { passThroughTransactions, queueRows, paramsOfCall, sqlOfCall } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/infra/email/index.js", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ delivered: false }),
}));

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "invitation-token-abcdefghijklmnop";
const CODE = "482913";

function firebaseUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: "fb-uid-1",
    email: "daughter@example.com",
    emailVerified: true,
    name: "Daughter",
    firebaseToken: {} as any,
    ...overrides,
  };
}

const userRow = {
  id: "user-1",
  firebase_uid: "fb-uid-1",
  email: "daughter@example.com",
  name: "Daughter",
  avatar_url: null,
  phone_e164: null,
  role: "caretaker",
  created_at: new Date(),
  updated_at: new Date(),
};

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    device_id: "dev-uuid-1",
    email: "daughter@example.com",
    token_hash: sha256Hex(TOKEN),
    pairing_code_hash: hashPairingCode(INVITATION_ID, CODE),
    code_attempts: 0,
    role: "primary",
    expires_at: new Date(Date.now() + 3600_000),
    created_by: null,
    created_by_device: "dev-uuid-1",
    accepted_by: null,
    accepted_at: null,
    revoked_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe("InvitationsService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    passThroughTransactions();
    vi.mocked(sendInvitationEmail).mockResolvedValue({ delivered: false });
  });

  describe("createFromDevice", () => {
    it("stores only hashes, and returns an accept path when the email was not sent", async () => {
      const device = {
        id: "dev-uuid-1",
        device_id: "dev-1",
        display_name: null,
        device_metadata: { model: "Redmi Note 8 Pro" },
      };
      // findDevice, caretakers, hasActivePrimary, revokePending, insertInvitation, audit
      queueRows([device], [], [], [], [invitationRow()], []);

      const result = await invitationsService.createFromDevice("dev-uuid-1", "Daughter@Example.com");

      expect(result.pairingCode).toMatch(/^\d{6}$/);
      expect(result.role).toBe("primary");
      expect(result.acceptPath).toMatch(/^\/accept-invitation\?token=/);
      const token = decodeURIComponent(result.acceptPath!.split("token=")[1] ?? "");
      const insertParams = paramsOfCall(4);
      expect(insertParams[3]).toMatch(/^[0-9a-f]{64}$/);
      expect(insertParams[4]).toBe(hashPairingCode(String(insertParams[0]), result.pairingCode));
      expect(insertParams).not.toContain(result.pairingCode);
      expect(insertParams).not.toContain(token);
    });

    it("omits the accept path when the email was delivered", async () => {
      vi.mocked(sendInvitationEmail).mockResolvedValue({ delivered: true });
      const device = {
        id: "dev-uuid-1",
        device_id: "dev-1",
        display_name: null,
        device_metadata: null,
      };
      queueRows([device], [], [], [], [invitationRow()], []);
      const result = await invitationsService.createFromDevice("dev-uuid-1", "daughter@example.com");
      expect(result.acceptPath).toBeUndefined();
    });

    it("invites another caretaker when a primary already exists", async () => {
      const device = { id: "dev-uuid-1", device_id: "dev-1", display_name: null, device_metadata: null };
      queueRows(
        [device],
        [{ email: "primary@example.com" }],
        [{ "?column?": 1 }],
        [],
        [invitationRow({ role: "caretaker", email: "x@example.com" })],
        []
      );
      const result = await invitationsService.createFromDevice("dev-uuid-1", "x@example.com");
      expect(result.role).toBe("caretaker");
    });

    it("refuses an email that is already linked", async () => {
      queueRows(
        [{ id: "dev-uuid-1", device_id: "dev-1", display_name: null, device_metadata: null }],
        [{ email: "x@example.com" }]
      );
      await expectAppError(invitationsService.createFromDevice("dev-uuid-1", "x@example.com"), 409, "ALREADY_LINKED");
    });
  });

  describe("accept", () => {
    it("requires a verified email", async () => {
      await expectAppError(
        invitationsService.accept(firebaseUser({ emailVerified: false }), TOKEN, CODE),
        403,
        "EMAIL_NOT_VERIFIED"
      );
    });

    it("rejects a signed-in email that differs from the invited email", async () => {
      queueRows([{ ...userRow, email: "someone@else.com" }], [invitationRow()]);
      const err = await expectAppError(
        invitationsService.accept(firebaseUser({ email: "someone@else.com" }), TOKEN, CODE),
        403,
        "EMAIL_MISMATCH"
      );
      expect(err.details).toMatchObject({ invitedEmail: "daughter@example.com" });
    });

    it("counts a wrong pairing code and reports attempts remaining", async () => {
      queueRows([userRow], [invitationRow({ code_attempts: 1 })], [{ code_attempts: 2 }]);
      const err = await expectAppError(invitationsService.accept(firebaseUser(), TOKEN, "000000"), 400, "INVALID_PAIRING_CODE");
      expect(err.details).toEqual({ attemptsRemaining: 3 });
      expect(sqlOfCall(2)).toContain("code_attempts = code_attempts + 1");
    });

    it("locks the invitation on the fifth wrong code", async () => {
      queueRows([userRow], [invitationRow({ code_attempts: 4 })], [{ code_attempts: 5 }]);
      await expectAppError(invitationsService.accept(firebaseUser(), TOKEN, "000000"), 423, "INVITATION_LOCKED");
    });

    it("rejects even the right code once locked", async () => {
      queueRows([userRow], [invitationRow({ code_attempts: 5 })]);
      await expectAppError(invitationsService.accept(firebaseUser(), TOKEN, CODE), 423, "INVITATION_LOCKED");
    });

    it("rejects expired, used and unknown invitations", async () => {
      queueRows([userRow], [invitationRow({ expires_at: new Date(Date.now() - 1000) })]);
      await expectAppError(invitationsService.accept(firebaseUser(), TOKEN, CODE), 410, "INVITATION_EXPIRED");

      queueRows([userRow], [invitationRow({ accepted_at: new Date() })]);
      await expectAppError(invitationsService.accept(firebaseUser(), TOKEN, CODE), 409, "INVITATION_USED");

      queueRows([userRow], []);
      await expectAppError(invitationsService.accept(firebaseUser(), TOKEN, CODE), 404, "INVITATION_NOT_FOUND");
    });

    it("makes the first linked caretaker primary", async () => {
      queueRows(
        [userRow],
        [invitationRow()],
        [{ id: "dev-uuid-1", device_id: "dev-1" }], // SELECT … FOR UPDATE
        [], // hasActivePrimary → none
        [{ id: "link-1", caretaker_id: "user-1", device_id: "dev-uuid-1", role: "primary", status: "active" }],
        [], // markAccepted
        [] // audit
      );

      const result = await invitationsService.accept(firebaseUser(), TOKEN, CODE);

      expect(result).toEqual({ deviceId: "dev-1", role: "primary" });
      expect(paramsOfCall(4)).toEqual(["user-1", "dev-uuid-1", "primary"]);
      expect(sqlOfCall(6)).toContain("INSERT INTO audit_logs");
      expect(paramsOfCall(6)[2]).toBe("caretaker.linked");
    });

    it("links later caretakers as 'caretaker' even from a primary invitation (one primary per device)", async () => {
      queueRows(
        [userRow],
        [invitationRow({ role: "primary" })],
        [{ id: "dev-uuid-1", device_id: "dev-1" }],
        [{ "?column?": 1 }], // primary exists
        [{ id: "link-2", caretaker_id: "user-1", device_id: "dev-uuid-1", role: "caretaker", status: "active" }],
        [],
        []
      );

      const result = await invitationsService.accept(firebaseUser(), TOKEN, CODE);

      expect(result.role).toBe("caretaker");
      expect(paramsOfCall(4)[2]).toBe("caretaker");
    });
  });

  describe("invitationStatus", () => {
    it("derives status in priority order", () => {
      expect(invitationStatus(invitationRow() as any)).toBe("pending");
      expect(invitationStatus(invitationRow({ revoked_at: new Date() }) as any)).toBe("revoked");
      expect(invitationStatus(invitationRow({ code_attempts: 5 }) as any)).toBe("locked");
      expect(invitationStatus(invitationRow({ accepted_at: new Date(), code_attempts: 5 }) as any)).toBe("accepted");
    });
  });
});
