import { z } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { E164_REGEX } from "../../shared/utils/crypto.js";

/**
 * Versioned device document. The caretaker PIN is intentionally absent: it stays on the phone
 * and must not be added to this schema, snapshots, or any remote command.
 */
const phoneSchema = z
  .object({
    e164: z.string().trim().regex(E164_REGEX, "Phone number must be in E.164 format, e.g. +919876543210"),
    label: z.string().trim().max(40),
    whatsapp: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict();

const contactSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    phones: z.array(phoneSchema).max(5),
    order: z.number().int().nonnegative(),
    pinned: z.boolean(),
  })
  .strict();

const weatherSchema = z
  .object({
    locationName: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();

export const DeviceConfigSchema = z
  .object({
    locale: z
      .string()
      .trim()
      .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, "locale must be a BCP 47 tag such as hi or hi-IN"),
    contacts: z.array(contactSchema).max(40),
    emergency: z
      .object({
        primaryCaretakerUserId: z.uuid().nullable(),
      })
      .strict(),
    home: z
      .object({
        pinnedContactIds: z.array(z.string().trim().min(1).max(64)).max(4),
        weather: weatherSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    config.contacts.forEach((contact, index) => {
      if (ids.has(contact.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Contact ids must be unique",
          path: ["contacts", index, "id"],
        });
      }
      ids.add(contact.id);
      if (contact.phones.filter((phone) => phone.isDefault).length > 1) {
        ctx.addIssue({
          code: "custom",
          message: "A contact can have only one default phone",
          path: ["contacts", index, "phones"],
        });
      }
    });

    const pinnedIds = config.contacts.filter((contact) => contact.pinned).map((contact) => contact.id);
    const listed = [...config.home.pinnedContactIds].sort();
    const marked = [...pinnedIds].sort();
    const same = listed.length === marked.length && listed.every((id, index) => id === marked[index]);
    if (!same) {
      ctx.addIssue({
        code: "custom",
        message: "home.pinnedContactIds must match the contacts marked pinned",
        path: ["home", "pinnedContactIds"],
      });
    }
  });

export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

/** Document returned when nothing has been saved yet. Clients PUT it back with If-Match: 0. */
export const DEFAULT_DEVICE_CONFIG: DeviceConfig = DeviceConfigSchema.parse({
  locale: "hi",
  contacts: [],
  emergency: { primaryCaretakerUserId: null },
  home: {
    pinnedContactIds: [],
    weather: { locationName: null },
  },
});

/** If-Match carries the config version the caller read. `*` and missing values are rejected. */
export function parseIfMatchVersion(header: string | string[] | undefined): number {
  if (typeof header !== "string") {
    throw new AppError(400, "PRECONDITION_REQUIRED", "If-Match must be the current config version");
  }
  const unquoted = header.trim().replace(/^W\//i, "").replace(/^"(.*)"$/, "$1");
  if (!/^\d{1,10}$/.test(unquoted)) {
    throw new AppError(400, "PRECONDITION_REQUIRED", "If-Match must be the current config version");
  }
  const version = Number(unquoted);
  if (!Number.isSafeInteger(version) || version > 2_147_483_647) {
    throw new AppError(400, "PRECONDITION_REQUIRED", "If-Match must be the current config version");
  }
  return version;
}
