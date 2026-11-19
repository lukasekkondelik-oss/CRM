import { z } from "zod";

// ---- stavební bloky
export const id = z.guid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Očekává se datum ve tvaru YYYY-MM-DD");
export const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Očekává se čas ve tvaru HH:MM");
const text = (max = 300) => z.string().trim().max(max);
const limit = z.coerce.number().int().min(1).max(200).default(50);
const offset = z.coerce.number().int().min(0).default(0);
const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const emailField = z.union([z.email(), z.literal("")]).nullable().optional();
const icoField = z.string().transform((s) => s.replace(/\s/g, "")).pipe(z.union([z.string().regex(/^\d{8}$/, "IČO má 8 číslic"), z.literal("")])).nullable().optional();

export const ACTIVITY_TYPES = ["call", "meeting", "task", "email", "deadline"] as const;
export const activityType = z.enum(ACTIVITY_TYPES);

// ---- dealy
export const dealListQuery = z.object({
  pipeline_id: id.optional(), stage_id: id.optional(),
  status: z.enum(["open", "won", "lost", "all"]).default("open"),
  owner_id: z.union([id, z.literal("me")]).optional(),
  person_id: id.optional(), organization_id: id.optional(),
  q: text(100).optional(),
  sort: z.enum(["created_at", "updated_at", "value", "title"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit, offset,
});

const dealRefs = {
  pipeline_id: id.optional(), pipeline_name: text(100).optional(),
  stage_id: id.optional(), stage_name: text(100).optional(),
};
export const dealCreate = z.object({
  title: text(300).min(1, "Název je povinný"),
  value: z.number().min(0).max(1e12).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  ...dealRefs,
  person_id: id.nullable().optional(), person_name: text(200).optional(),
  organization_id: id.nullable().optional(), organization_name: text(200).optional(),
  owner_id: id.nullable().optional(),
  expected_close_date: isoDate.nullable().optional(),
});
export const dealUpdate = z.object({
  title: text(300).min(1).optional(),
  value: z.number().min(0).max(1e12).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  person_id: id.nullable().optional(), organization_id: id.nullable().optional(), owner_id: id.nullable().optional(),
  expected_close_date: isoDate.nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, "Zadej aspoň jedno pole ke změně.");
export const dealMove = z.object({ ...dealRefs, position: z.number().optional() })
  .refine((v) => v.stage_id || v.stage_name, "Zadej stage_id nebo stage_name.");
export const dealStatus = z.object({
  status: z.enum(["open", "won", "lost"]),
  lost_reason: text(500).optional(),
}).refine((v) => v.status !== "lost" || !!v.lost_reason?.trim(), { message: "U prohry je povinný lost_reason.", path: ["lost_reason"] });
export const dealLabels = z.object({ label_ids: z.array(id).max(50) });

// ---- osoby a firmy
export const personListQuery = z.object({ q: text(100).optional(), organization_id: id.optional(), owner_id: z.union([id, z.literal("me")]).optional(), limit, offset });
const personFields = {
  first_name: text(100).optional(), last_name: text(100).optional(),
  email: emailField, phone: text(50).nullable().optional(), position: text(100).nullable().optional(),
  owner_id: id.nullable().optional(),
};
export const personCreate = z.object({ ...personFields, organization_id: id.nullable().optional(), organization_name: text(200).optional() })
  .refine((v) => `${v.first_name ?? ""}${v.last_name ?? ""}`.trim().length > 0, "Zadej jméno nebo příjmení.");
export const personUpdate = z.object({ ...personFields, organization_id: id.nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, "Zadej aspoň jedno pole ke změně.");

export const orgListQuery = z.object({ q: text(100).optional(), owner_id: z.union([id, z.literal("me")]).optional(), limit, offset });
const orgFields = { ico: icoField, web: text(200).nullable().optional(), address: text(300).nullable().optional(), owner_id: id.nullable().optional() };
export const orgCreate = z.object({ name: text(200).min(1, "Název je povinný"), ...orgFields });
export const orgUpdate = z.object({ name: text(200).min(1).optional(), ...orgFields }).refine((v) => Object.keys(v).length > 0, "Zadej aspoň jedno pole ke změně.");

// ---- aktivity, poznámky
export const activityListQuery = z.object({
  done: bool.optional(),
  due: z.enum(["today", "overdue", "week", "all"]).default("all"),
  from: isoDate.optional(), to: isoDate.optional(),
  assigned_to: z.union([id, z.literal("me")]).optional(),
  deal_id: id.optional(), person_id: id.optional(), organization_id: id.optional(),
  type: activityType.optional(), limit, offset,
});
const activityFields = {
  type: activityType.optional(), note: text(5000).nullable().optional(),
  due_date: isoDate.nullable().optional(), due_time: isoTime.nullable().optional(),
  duration_min: z.number().int().min(1).max(1440).nullable().optional(),
  assigned_to: id.nullable().optional(),
};
export const activityCreate = z.object({
  subject: text(300).min(1, "Předmět je povinný"), ...activityFields,
  deal_id: id.nullable().optional(), person_id: id.nullable().optional(), organization_id: id.nullable().optional(),
});
export const activityUpdate = z.object({ subject: text(300).min(1).optional(), ...activityFields })
  .refine((v) => Object.keys(v).length > 0, "Zadej aspoň jedno pole ke změně.");
export const activityComplete = z.object({
  /** další krok – naplánuje navazující aktivitu na stejný deal (jádro workflow) */
  next: z.object({ subject: text(300).min(1), type: activityType.optional(), due_date: isoDate.optional(), due_time: isoTime.optional(), note: text(5000).optional() }).optional(),
});

export const noteListQuery = z.object({ deal_id: id.optional(), person_id: id.optional(), organization_id: id.optional(), limit, offset });
export const noteCreate = z.object({
  content: text(10000).min(1, "Obsah je povinný"),
  deal_id: id.optional(), person_id: id.optional(), organization_id: id.optional(),
}).refine((v) => [v.deal_id, v.person_id, v.organization_id].filter(Boolean).length === 1, "Zadej právě jedno z deal_id, person_id, organization_id.");
