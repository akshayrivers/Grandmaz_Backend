import { vi } from "vitest";
import * as dbClient from "../../src/infra/database/client.js";

export function result<T>(rows: T[]) {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] } as any;
}

/** Queues mocked `query` results in call order. */
export function queueRows(...rowSets: unknown[][]) {
  for (const rows of rowSets) {
    vi.mocked(dbClient.query).mockResolvedValueOnce(result(rows));
  }
}

/** Makes `withTransaction(fn)` run `fn` against the mocked `query`. */
export function passThroughTransactions() {
  vi.mocked(dbClient.withTransaction).mockImplementation(async (fn: any) => fn(dbClient.query));
}

export function sqlOfCall(index: number): string {
  return String(vi.mocked(dbClient.query).mock.calls[index]?.[0] ?? "");
}

export function paramsOfCall(index: number): unknown[] {
  return (vi.mocked(dbClient.query).mock.calls[index]?.[1] as unknown[]) ?? [];
}
