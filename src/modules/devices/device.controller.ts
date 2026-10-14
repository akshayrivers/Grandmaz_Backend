import type { FastifyRequest, FastifyReply } from "fastify";
import { deviceService } from "./device.service.js";
import {
  RegisterDeviceSchema,
  CreateChallengeSchema,
  VerifyChallengeSchema,
  RenameDeviceSchema,
} from "./device.schemas.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";
import { getCurrentUser } from "../../middleware/authenticate.js";
import { getDeviceAccess } from "../../middleware/authorize.js";

export class DeviceController {
  /** POST /api/devices/register — public, rate-limited. */
  async registerDevice(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrThrow(RegisterDeviceSchema, request.body);
    const result = await deviceService.registerDevice({
      deviceId: body.deviceId,
      publicKey: body.publicKey,
      keyAlgorithm: body.keyAlgorithm,
      deviceMetadata: body.deviceMetadata,
    });
    return reply.status(result.created ? 201 : 200).send({ success: true, data: result.device });
  }

  /** POST /api/devices/challenge — public, rate-limited. */
  async createChallenge(request: FastifyRequest, reply: FastifyReply) {
    const { deviceId } = parseOrThrow(CreateChallengeSchema, request.body);
    const data = await deviceService.createChallenge(deviceId);
    return reply.send({ success: true, data });
  }

  /** POST /api/devices/verify-signature — public, rate-limited; issues the device token. */
  async verifySignature(request: FastifyRequest, reply: FastifyReply) {
    const body = parseOrThrow(VerifyChallengeSchema, request.body);
    const data = await deviceService.verifySignature(body);
    return reply.send({ success: true, data });
  }

  /** GET /api/devices — devices the caretaker is linked to. */
  async getMyDevices(request: FastifyRequest, reply: FastifyReply) {
    const user = await getCurrentUser(request);
    const data = await deviceService.getMyDevices(user.id);
    return reply.send({ success: true, data });
  }

  /** GET /api/devices/:deviceId — any linked role. */
  async getDevice(request: FastifyRequest, reply: FastifyReply) {
    const access = getDeviceAccess(request);
    const data = await deviceService.getDeviceForCaretaker(access.userId, access.deviceUuid);
    return reply.send({ success: true, data });
  }

  /** PATCH /api/devices/:deviceId — primary only. */
  async renameDevice(request: FastifyRequest, reply: FastifyReply) {
    const access = getDeviceAccess(request);
    const { displayName } = parseOrThrow(RenameDeviceSchema, request.body);
    const data = await deviceService.renameDevice(access.userId, access.deviceUuid, displayName);
    return reply.send({ success: true, data });
  }
}

export const deviceController = new DeviceController();
