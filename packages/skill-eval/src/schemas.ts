import { z } from 'zod';

/**
 * IDE-helper fields that the JSON Schema explicitly allows but the runtime
 * ignores: `$schema` and `description` at the top level; `note` per item.
 * We accept them here so unknown-key strictness only flags real typos.
 */

export const evalItemSchema = z
  .object({
    query: z.string().min(1),
    should_trigger: z.boolean(),
    note: z.string().optional(),
  })
  .strict();

export const evalSetSchema = z
  .object({
    $schema: z.string().optional(),
    description: z.string().optional(),
    skill_name: z.string().min(1),
    evals: z.array(evalItemSchema).min(1),
  })
  .strict();

export type EvalSetInput = z.infer<typeof evalSetSchema>;
