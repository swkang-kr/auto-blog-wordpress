import winston from 'winston';
import { randomUUID } from 'node:crypto';

const { combine, timestamp, printf, colorize, json } = winston.format;

const isStructured = process.env.LOG_FORMAT === 'json';

// Correlation ID for tracing a single batch run across all log entries
const batchCorrelationId = randomUUID().slice(0, 8);

const humanFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] [${level}] ${message}`;
});

const structuredFormat = combine(
  timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  json(),
  printf(({ level, message, timestamp, ...rest }) => {
    return JSON.stringify({
      timestamp,
      level,
      correlationId: batchCorrelationId,
      message,
      ...rest,
    });
  }),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: isStructured ? 'YYYY-MM-DDTHH:mm:ss.SSSZ' : 'YYYY-MM-DD HH:mm:ss' }),
    isStructured ? structuredFormat : humanFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: isStructured
        ? structuredFormat
        : combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), humanFormat),
    }),
  ],
});

/** Get the batch correlation ID for structured tracing */
export function getCorrelationId(): string {
  return batchCorrelationId;
}
