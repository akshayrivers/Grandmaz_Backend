import { randomUUID } from "crypto";
import { insertMediaAsset, findMediaAssetForDevice, type MediaAssetRow } from "../../infra/database/queries/media_assets.queries.js";
import { storage } from "../../infra/storage/index.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditLogsService } from "../audit-logs/audit-logs.service.js";

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const AUDIO_MAX_BYTES = 5 * 1024 * 1024;
const AUDIO_MAX_MS = 30_000;

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/webm", "audio/3gpp"]);

export interface StoredAsset {
  assetId: string;
  kind: "photo" | "audio";
  contentType: string;
  byteSize: number;
  durationMs: number | null;
}

function decodeBase64(value: string): Buffer {
  const compact = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new AppError(400, "VALIDATION_ERROR", "dataBase64 is not valid base64");
  }
  return Buffer.from(compact, "base64");
}

export class MediaService {
  async save(input: {
    deviceUuid: string;
    kind: "photo" | "audio";
    contentType: string;
    dataBase64: string;
    durationMs?: number | undefined;
    createdByUser: string | null;
    createdByDevice: string | null;
  }): Promise<StoredAsset> {
    const contentType = input.contentType.toLowerCase();
    const allowed = input.kind === "photo" ? PHOTO_TYPES : AUDIO_TYPES;
    if (!allowed.has(contentType)) {
      throw new AppError(400, "MEDIA_TYPE_UNSUPPORTED", "That file type is not allowed");
    }
    if (input.kind === "audio" && (input.durationMs === undefined || input.durationMs <= 0 || input.durationMs > AUDIO_MAX_MS)) {
      throw new AppError(400, "AUDIO_TOO_LONG", "Voice clips must be 30 seconds or shorter");
    }

    const bytes = decodeBase64(input.dataBase64);
    const limit = input.kind === "photo" ? PHOTO_MAX_BYTES : AUDIO_MAX_BYTES;
    if (bytes.length === 0 || bytes.length > limit) {
      throw new AppError(400, "MEDIA_TOO_LARGE", input.kind === "photo" ? "Photos must be 2 MB or smaller" : "Voice clips must be 5 MB or smaller");
    }

    const assetId = randomUUID();
    const storageKey = `${input.deviceUuid}/${assetId}`;
    await storage.put(storageKey, bytes);
    const row = await insertMediaAsset({
      id: assetId,
      deviceUuid: input.deviceUuid,
      kind: input.kind,
      contentType,
      byteSize: bytes.length,
      durationMs: input.kind === "audio" ? (input.durationMs ?? null) : null,
      storageKey,
      createdByUser: input.createdByUser,
      createdByDevice: input.createdByDevice,
    });
    await auditLogsService.record("media.created", {
      deviceUuid: input.deviceUuid,
      ...(input.createdByUser ? { userId: input.createdByUser } : {}),
      details: { assetId, kind: input.kind, byteSize: bytes.length },
    });
    return toStored(row);
  }

  async read(deviceUuid: string, assetId: string): Promise<{ row: MediaAssetRow; bytes: Buffer }> {
    const row = await findMediaAssetForDevice(deviceUuid, assetId);
    if (!row) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media not found");
    }
    const bytes = await storage.open(row.storage_key);
    if (!bytes) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media not found");
    }
    return { row, bytes };
  }
}

function toStored(row: MediaAssetRow): StoredAsset {
  return {
    assetId: row.id,
    kind: row.kind,
    contentType: row.content_type,
    byteSize: row.byte_size,
    durationMs: row.duration_ms,
  };
}

export const mediaService = new MediaService();
