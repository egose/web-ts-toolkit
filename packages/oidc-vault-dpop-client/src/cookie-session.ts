/** Coordination only: never a token, session handle, or substitute signing key. */
interface CookieGeneration {
  generation: string;
  active: boolean;
  refreshedAt?: number;
}

export interface DpopCookieSessionVersion extends CookieGeneration {
  /** Installed records without a mode are DPoP only. */
  mode?: 'dpop';
  jkt: string;
}

export interface BearerCookieSessionVersion extends CookieGeneration {
  mode: 'bearer';
  jkt?: never;
}

export type CookieSessionVersion = DpopCookieSessionVersion | BearerCookieSessionVersion;

/** Project only validated coordination fields, including when reading old installations. */
export const parseCookieSessionVersion = (value: unknown): CookieSessionVersion | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const { mode, jkt, generation, active, refreshedAt } = record;
  if (typeof generation !== 'string' || !generation || typeof active !== 'boolean') return undefined;
  const clock =
    Number.isSafeInteger(refreshedAt) && (refreshedAt as number) >= 0 ? { refreshedAt: refreshedAt as number } : {};
  if (mode === 'bearer') {
    if ('jkt' in record) return undefined;
    return { mode, generation, active, ...clock };
  }
  if ((mode !== undefined && mode !== 'dpop') || typeof jkt !== 'string') return undefined;
  return { ...(mode === 'dpop' ? { mode } : {}), jkt, generation, active, ...clock };
};

export const cookieMode = (value: { mode?: 'dpop' | 'bearer' }): 'dpop' | 'bearer' => value.mode ?? 'dpop';

/** Activity/timing are not binding identity. A rotation or mode change is. */
export const sameCookieBinding = (
  left: CookieSessionVersion | undefined,
  right: CookieSessionVersion | undefined,
): boolean =>
  left !== undefined &&
  right !== undefined &&
  cookieMode(left) === cookieMode(right) &&
  left.generation === right.generation &&
  left.jkt === right.jkt;
