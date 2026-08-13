import type { Request } from 'express';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export const getBody = (req: Request): Record<string, unknown> => (isRecord(req.body) ? req.body : {});
