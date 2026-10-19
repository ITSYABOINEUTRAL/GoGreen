const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const isProduction = config.nodeEnv === 'production';

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const transports = [
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
  }),
];

if (isProduction) {
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (err) {
    console.error(`[logger] Failed to create logs directory at ${logsDir}:`, err);
  }

  const fileFormat = combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  );

  const errorTransport = new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
  });
  const combinedTransport = new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
  });

  [errorTransport, combinedTransport].forEach((transport) => {
    transport.on('error', (err) => {
      console.error('[logger] File transport error:', err);
    });
  });

  transports.push(errorTransport, combinedTransport);
}

const logger = winston.createLogger({
  level: config.logLevel || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports,
  exitOnError: false,
});

module.exports = logger;
