import {
  findUserByFirebaseUid,
  insertUserFromFirebase,
  updateUserFromFirebase,
  updateUserProfile,
  type UserRow,
} from "../../infra/database/queries/users.queries.js";
import type { AuthenticatedUser } from "../../infra/firebase/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserProfileResponse, UpdateUserProfileInput } from "./users.types.js";

export function toUserProfile(row: UserRow, emailVerified: boolean): UserProfileResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    phoneE164: row.phone_e164,
    emailVerified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UsersService {
  /**
   * Ensures a Postgres user row exists for the Firebase identity. Never links devices:
   * caretaker links are only created by accepting an invitation with its pairing code.
   */
  async syncFromFirebase(firebaseUser: AuthenticatedUser): Promise<UserRow> {
    if (!firebaseUser.email) {
      throw new AppError(400, "EMAIL_REQUIRED", "Your sign-in account must have an email address");
    }

    const updated = await updateUserFromFirebase({
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      avatarUrl: firebaseUser.picture,
    });
    if (updated) {
      return updated;
    }

    const inserted = await insertUserFromFirebase({
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      emailVerified: firebaseUser.emailVerified === true,
      name: firebaseUser.name,
      avatarUrl: firebaseUser.picture,
    });
    if (!inserted) {
      throw new AppError(
        403,
        "EMAIL_NOT_VERIFIED",
        "An account with this email already exists. Verify your email address to continue."
      );
    }
    return inserted;
  }

  async getProfile(firebaseUser: AuthenticatedUser): Promise<UserProfileResponse> {
    const user = (await findUserByFirebaseUid(firebaseUser.uid)) ?? (await this.syncFromFirebase(firebaseUser));
    return toUserProfile(user, firebaseUser.emailVerified === true);
  }

  async updateProfile(user: UserRow, emailVerified: boolean, input: UpdateUserProfileInput): Promise<UserProfileResponse> {
    const updated = await updateUserProfile(user.id, input);
    if (!updated) {
      throw new AppError(404, "USER_NOT_FOUND", "User profile not found");
    }
    return toUserProfile(updated, emailVerified);
  }
}

export const usersService = new UsersService();
