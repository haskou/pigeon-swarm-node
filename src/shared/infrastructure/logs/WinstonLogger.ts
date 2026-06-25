import Kernel from '@haskou/ddd-kernel';
import expressWinston from 'express-winston';
import winston, { Logger, format } from 'winston';

import Server from '../express/Server';
import Log from './Log';

export default class WinstonLogger implements Log {
  private prefix: string = '';

  private readonly consoleFormat = format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.colorize(),
    format.printf((entry) => {
      const timestamp = String(entry.timestamp || '');
      const level = String(entry.level);
      const message = this.formatConsoleMessage(entry.message);

      return `${timestamp} ${level.padEnd(7)} ${message}`;
    }),
  );

  private readonly jsonFormat = format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.json(),
  );

  private readonly opts = {
    level: process.env.LOG_LEVEL,
    transports: [
      new winston.transports.Console({
        format: this.consoleFormat,
        level: process.env.LOG_LEVEL,
      }),
      new winston.transports.File({
        filename: this.getLogFileName(),
        format: this.jsonFormat,
        level: process.env.LOG_LEVEL,
      }),
    ],
  };

  private _logger: Logger;

  constructor(private readonly server?: Server) {}

  private getLogFileName(): string {
    const logDirectory = process.env.LOG_URL || 'logs';
    const serviceName = process.env.SERVICE_NAME || 'service';

    return `${Kernel.rootDirectory}/${logDirectory}/${serviceName}.log`;
  }

  private formatConsoleMessage(message: unknown): string {
    if (typeof message !== 'string') {
      return String(message);
    }

    const parsedMessage = this.parseJSONMessage(message);

    if (!parsedMessage) {
      return message;
    }

    return Object.entries(parsedMessage)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${this.formatConsoleValue(value)}`)
      .join(' ');
  }

  private formatConsoleValue(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.formatConsoleValue(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }

    return JSON.stringify(value);
  }

  private parseJSONMessage(
    message: string,
  ): Record<string, unknown> | undefined {
    try {
      const parsedMessage: unknown = JSON.parse(message);

      if (
        !parsedMessage ||
        typeof parsedMessage !== 'object' ||
        Array.isArray(parsedMessage)
      ) {
        return undefined;
      }

      return parsedMessage as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  public error(message: string): void {
    this.logger.error(this.prefix + message);
  }

  public warn(message: string): void {
    this.logger.warn(this.prefix + message);
  }

  public info(message: string): void {
    this.logger.info(this.prefix + message);
  }

  public debug(message: string): void {
    this.logger.debug(this.prefix + message);
  }

  public get logger(): Logger {
    if (!this._logger) {
      this._logger = winston.createLogger(this.opts);
    }

    return this._logger;
  }

  public run(prefix?: string): void {
    this.prefix = prefix || '';
    this.server?.app.use(expressWinston.logger(this.opts));
  }
}
