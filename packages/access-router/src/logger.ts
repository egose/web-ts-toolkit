import { getGlobalOption } from './options';
export { defaultLogger } from './logger-default';
import { defaultLogger } from './logger-default';

const passthrough =
  (level: 'debug' | 'info' | 'warn' | 'error') =>
  (...args: unknown[]) => {
    const globalLogger = getGlobalOption('logger');
    const target = globalLogger?.[level] ?? defaultLogger[level];
    try {
      return target.apply(globalLogger ?? defaultLogger, args);
    } catch {
      // ARF-07: legacy logger.* passthrough must never throw and break HTTP
      // operations. Call sites are being migrated to the non-throwing helpers
      // in ./logger-helpers; this guard retains safety for any remaining
      // direct logger.* usage and for external consumers of this legacy API.
    }
  };

export const logger = {
  debug: passthrough('debug'),
  info: passthrough('info'),
  warn: passthrough('warn'),
  error: passthrough('error'),
};
