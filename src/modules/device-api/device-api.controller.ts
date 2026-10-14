import type { FastifyRequest, FastifyReply } from "fastify";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";
import { deviceService } from "../devices/device.service.js";
import { PushTokenSchema } from "../devices/device.schemas.js";
import { invitationsService } from "../invitations/invitations.service.js";
import { DeviceCreateInvitationSchema, InvitationIdParamsSchema } from "../invitations/invitations.schemas.js";
import { commandsService } from "../commands/commands.service.js";
import {
  deviceListTasksQuerySchema,
  deviceUpdateTaskStatusSchema,
  taskIdParamsSchema,
} from "../commands/commands.schemas.js";
import { sharedStateService } from "../shared-state/shared-state.service.js";
import { postSnapshotSchema } from "../shared-state/shared-state.schemas.js";
import { helpRequestsService } from "../help-requests/help-requests.service.js";
import { createHelpRequestSchema } from "../help-requests/help-requests.schemas.js";

/** GET /api/device/me */
export async function getSelfHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const data = await deviceService.getSelf(device.uuid);
  return reply.send({ success: true, data });
}

/** POST /api/device/invitations */
export async function createInvitationHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { email } = parseOrThrow(DeviceCreateInvitationSchema, request.body);
  const data = await invitationsService.createFromDevice(device.uuid, email);
  return reply.status(201).send({ success: true, data });
}

/** GET /api/device/invitations/:id */
export async function getInvitationStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { id } = parseOrThrow(InvitationIdParamsSchema, request.params);
  const data = await invitationsService.getStatusForDevice(device.uuid, id);
  return reply.send({ success: true, data });
}

/** PUT /api/device/push-token */
export async function putPushTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { fcmToken } = parseOrThrow(PushTokenSchema, request.body);
  await deviceService.setPushToken(device.uuid, fcmToken);
  return reply.status(204).send();
}

/** GET /api/device/commands?status=pending */
export async function listCommandsHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  parseOrThrow(deviceListTasksQuerySchema, request.query);
  const data = await commandsService.deliverPending(device.uuid);
  return reply.send({ success: true, data });
}

/** PATCH /api/device/commands/:id/status */
export async function updateCommandStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { id } = parseOrThrow(taskIdParamsSchema, request.params);
  const { status, result } = parseOrThrow(deviceUpdateTaskStatusSchema, request.body);
  const data = await commandsService.updateStatusFromDevice(device.uuid, id, status, result);
  return reply.send({ success: true, data });
}

/** POST /api/device/snapshot */
export async function postSnapshotHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const body = parseOrThrow(postSnapshotSchema, request.body ?? {});
  const data = await sharedStateService.recordSnapshot(device.uuid, {
    batteryLevel: body.batteryLevel,
    batteryStatus: body.batteryStatus,
    wifiSsid: body.wifiSsid,
    storageFreeMb: body.storageFreeMb,
    installedApps: body.installedApps,
    settings: body.settings,
    snapshotData: body.snapshotData,
  });
  return reply.status(201).send({ success: true, data });
}

/** POST /api/device/help-requests */
export async function createHelpRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const body = parseOrThrow(createHelpRequestSchema, request.body);
  const data = await helpRequestsService.create(device.uuid, {
    title: body.title,
    description: body.description,
    type: body.type,
  });
  return reply.status(201).send({ success: true, data });
}
