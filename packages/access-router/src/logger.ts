import { getGlobalOption } from './options';
export { defaultLogger } from './logger-default';
import { defaultLogger } from './logger-default';

const passthrough =
  (level: 'debug' | 'info' | 'warn' | 'error') =>
  (...args: unknown[]) => {
    const globalLogger = getGlobalOption('logger');
    const target = globalLogger?.[level] ?? defaultLogger[level];
    return target.apply(globalLogger ?? defaultLogger, args);
  };

export const logger = {
  debug: passthrough('debug'),
  info: passthrough('info'),
  warn: passthrough('warn'),
  error: passthrough('error'),
};
