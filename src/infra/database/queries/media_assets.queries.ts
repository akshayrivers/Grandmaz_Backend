import { query, type QueryFn } from "../client.js";

export type MediaKind = "photo" | "audio";

export interface MediaAssetRow {
  id: string;
  device_id: string;
  kind: MediaKind;
  content_type: string;
  byte_size: number;
  duration_ms: number | null;
  storage_key: string;
  created_by_user: string | null;
  created_by_device: string | null;
  created_at: Date;
}

const COLUMNS = `id, device_id, kind, content_type, byte_size, duration_ms, storage_key,
  created_by_user, created_by_device, created_at`;

export async function insertMediaAsset(
  data: {
    id: string;
    deviceUuid: string;
    kind: MediaKind;
    contentType: string;
    byteSize: number;
    durationMs: number | null;
    storageKey: string;
    createdByUser: string | null;
    createdByDevice: string | null;
  },
  q: QueryFn = query
): Promise<MediaAssetRow> {
  const res = await q<MediaAssetRow>(
    `INSERT INTO media_assets
       (id, device_id, kind, content_type, byte_size, duration_ms, storage_key, created_by_user, created_by_device)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      data.id,
      data.deviceUuid,
      data.kind,
      data.contentType,
      data.byteSize,
      data.durationMs,
      data.storageKey,
      data.createdByUser,
      data.createdByDevice,
    ]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error("media insert returned no row");
  }
  return row;
}

export async function findMediaAssetForDevice(
  deviceUuid: string,
  assetId: string,
  q: QueryFn = query
): Promise<MediaAssetRow | null> {
  const res = await q<MediaAssetRow>(
    `SELECT ${COLUMNS} FROM media_assets WHERE device_id = $1 AND id = $2`,
    [deviceUuid, assetId]
  );
  return res.rows[0] ?? null;
}
