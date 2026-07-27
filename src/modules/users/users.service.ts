import { findUserByFirebaseUid, updateUserProfile } from "../../infra/database/queries/users.queries.js";
import type { UserProfileResponse, UpdateUserProfileInput } from "./users.types.js";

export class UsersService {
  async getProfileByFirebaseUid(firebaseUid: string): Promise<UserProfileResponse> {
    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) {
      throw new Error("User profile not found");
    }
    return {
      id: user.id,
      firebaseUid: user.firebase_uid,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      role: user.role,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async updateProfile(
    firebaseUid: string,
    input: UpdateUserProfileInput
  ): Promise<UserProfileResponse> {
    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) {
      throw new Error("User profile not found");
    }

    const updated = await updateUserProfile(user.id, input);
    if (!updated) {
      throw new Error("Failed to update profile");
    }

    return {
      id: updated.id,
      firebaseUid: updated.firebase_uid,
      email: updated.email,
      name: updated.name,
      avatarUrl: updated.avatar_url,
      role: updated.role,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }
}

export const usersService = new UsersService();
