import util from 'node:util';
import { createLogger, format, transports } from 'winston';

const colorizer = format.colorize();
const defaultLogLevel = process.env.WTT_LOG_LEVEL || 'silent';

const inspectValue = (value: unknown) => {
  return typeof value === 'string' ? value : util.inspect(value, { depth: 5, colors: false });
};

export const defaultLogger = createLogger({
  level: defaultLogLevel,
  format: format.combine(
    format.errors({ stack: true }),
    format.splat(),
    format.label({ label: '[WTT]' }),
    format.timestamp(),
    format.printf(({ level, label, message, timestamp, stack, ...meta }) => {
      const formattedLabel = colorizer.colorize(level, label);
      const formattedLevel = colorizer.colorize(level, `[${level.toUpperCase()}]`);
      const formattedMessage = colorizer.colorize(level, inspectValue(stack ?? message));
      const formattedMeta = Object.keys(meta).length > 0 ? ` ${inspectValue(meta)}` : '';

      return `${formattedLabel} ${timestamp} ${formattedLevel} ${formattedMessage}${formattedMeta}`;
    }),
  ),
  transports: [new transports.Console()],
});
