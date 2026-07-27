import type { FastifyRequest, FastifyReply } from "fastify";
import { deviceService } from "./device.service.js";
import {
  RegisterDeviceSchema,
  CreateChallengeSchema,
  VerifyChallengeSchema,
  GetDeviceParamsSchema,
} from "./device.schemas.js";

export class DeviceController {
  /**
   * POST /api/devices/register
   * Register a new device with public key & metadata. Returns device & initial challenge.
   */
  async registerDevice(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = RegisterDeviceSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid payload",
      });
    }

    try {
      const result = await deviceService.registerDevice(parseResult.data);
      return reply.status(201).send({
        success: true,
        data: result.device,
        challenge: result.challenge,
      });
    } catch (err: any) {
      request.log.error({ err }, "Error registering device");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: err.message || "Failed to register device",
      });
    }
  }

  /**
   * POST /api/devices/challenge
   * Request a fresh challenge string for a registered device.
   */
  async createChallenge(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = CreateChallengeSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid payload",
      });
    }

    try {
      const challenge = await deviceService.createChallenge(parseResult.data.deviceId);
      return reply.status(200).send({
        success: true,
        challenge,
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: err.message || "Device not found",
      });
    }
  }

  /**
   * POST /api/devices/verify-signature
   * Solves challenge by verifying digital signature against stored public key.
   */
  async verifySignature(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = VerifyChallengeSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid payload",
      });
    }

    try {
      const result = await deviceService.verifySignature(parseResult.data);
      if (!result.verified) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: result.message,
        });
      }

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to verify signature",
      });
    }
  }

  /**
   * GET /api/devices/:deviceId
   * Fetch device details and verification status.
   */
  async getDevice(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = GetDeviceParamsSchema.safeParse(request.params);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid parameter",
      });
    }

    try {
      const device = await deviceService.getDevice(parseResult.data.deviceId);
      return reply.status(200).send({
        success: true,
        data: device,
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: err.message || "Device not found",
      });
    }
  }
}

export const deviceController = new DeviceController();
