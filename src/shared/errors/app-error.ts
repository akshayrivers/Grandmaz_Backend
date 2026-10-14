import type { ZodType } from "zod";
import { z } from "zod";

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  423: "Locked",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

/**
 * Error with an HTTP status and a stable machine-readable `code`.
 * The global error handler serialises it as `{ statusCode, error, message, code, details? }`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toResponse(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      statusCode: this.statusCode,
      error: STATUS_TEXT[this.statusCode] ?? "Error",
      message: this.message,
      code: this.code,
    };
    if (this.details !== undefined) {
      body.details = this.details;
    }
    return body;
  }
}

export function statusText(statusCode: number): string {
  return STATUS_TEXT[statusCode] ?? "Error";
}

/** Parses `data` with `schema` or throws a 400 VALIDATION_ERROR. */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      result.error.issues[0]?.message ?? "Invalid request payload",
      z.flattenError(result.error)
    );
  }
  return result.data;
}
