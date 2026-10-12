import { z } from 'zod';
import { assertPublicAdmission, PublicAdmissionError, type PublicAdmissionKind } from './public-admission';

const admissions = new WeakMap<z.ZodType, PublicAdmissionKind>();

/** Retain schema identity's boundary kind for checking custom-validator output. */
export function publicBoundarySchema<T extends z.ZodType>(schema: T, kind: PublicAdmissionKind = 'envelope'): T {
  const checked = schema.superRefine((value, ctx) => {
    try {
      assertPublicAdmission(value, kind);
    } catch (error) {
      if (!(error instanceof PublicAdmissionError)) throw error;
      ctx.addIssue({ code: 'custom', message: error.result.errors![0].detail });
    }
  });
  admissions.set(checked, kind);
  return checked;
}

export function assertTransformedPublicAdmission(schema: z.ZodType, value: unknown): void {
  const kind = admissions.get(schema);
  if (kind) assertPublicAdmission(value, kind);
}
