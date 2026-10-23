import { z } from "zod";
const text = z.string().trim().min(1).max(10000);
export const positionSchema = z.object({
  position_line: text,
  thesis: text,
  concept_name: text,
  concept_description: text,
  audience: text,
  differentiation: text,
  known_for: text,
  objective: text,
});
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
export const draftSchema = z.object({
  base_id: z.string().uuid(),
  positioning: positionSchema,
  pillars: z.array(z.object({ key: text, name: text.max(500), description: text })).length(3),
  ctas: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(3),
        label: text.max(1000),
        destination: z
          .string()
          .max(2000)
          .refine((s) => !/^\s*(javascript|data|vbscript):/i.test(s), "Unsafe destination"),
      }),
    )
    .length(3),
  targets: z.array(
    z.object({
      kpi_key: text,
      target_value: z.number().finite().nullable(),
      target_by: date.nullable(),
    }),
  ),
});
export const saveSchema = draftSchema.extend({
  change_note: z.string().trim().min(1, "A change note is required.").max(200),
});
export const eventSchema = z.object({
  date,
  label: text.max(1000),
  kind: z.enum(["strategy change", "campaign", "travel", "podcast", "other"]),
});
export type Draft = z.infer<typeof draftSchema>;
export const hasChanges = (a: Draft, b: Draft) => JSON.stringify(a) !== JSON.stringify(b);
export function destinationHref(destination: string | null) {
  if (!destination) return undefined;
  const s = destination.trim();
  if (/^(https?:\/\/|mailto:)/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(s)) return `https://${s}`;
  return undefined;
}
