// Core types from SPEC.md. TargetRef / ElementInfo / Change are derived from their zod schemas so the
// runtime validation and the static types cannot drift apart.
import type { z } from 'zod';
import type { changeSchema } from './changes';
import type { STYLING_SYSTEMS, elementInfoSchema, targetRefSchema } from './element-info';

export type TargetRef = z.infer<typeof targetRefSchema>;
export type StylingSystem = (typeof STYLING_SYSTEMS)[number];
export type ElementInfo = z.infer<typeof elementInfoSchema>;

export type Change = z.infer<typeof changeSchema>;

export interface Variant {
  id: string;
  name: string;
  rationale: string;
  changes: Omit<Change, 'id' | 'createdAt'>[];
}
