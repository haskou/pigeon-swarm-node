import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import Kernel from '@haskou/ddd-kernel';
import { HttpApp } from '@haskou/ddd-kernel/adapters/ui';
import expressWinston from 'express-winston';
import winston, { Logger, format } from 'winston';

import { Log } from './Log';

type HttpAppProvider = {
  readonly app: HttpApp;
};

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

  private _logger: Logger;

  private fileOptions: ConstructorParameters<typeof winston.transports.File>[0];

  private fileTransport?: InstanceType<typeof winston.transports.File>;

  private server?: HttpAppProvider;

  private createConsoleTransport(level: string) {
    return new winston.transports.Console({
      format: this.consoleFormat,
      level,
    });
  }

  private createFileOptions(level: string) {
    return {
      filename: this.getLogFileName(),
      format: this.jsonFormat,
      level,
    };
  }

  private getLogFileName(): string {
    const environment = pigeonEnvironment();
    const logDirectory = environment.LOG_URL;
    const serviceName = environment.SERVICE_NAME || 'service';

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
      const environment = pigeonEnvironment();

      this.fileOptions = this.createFileOptions(environment.LOG_LEVEL);
      this._logger = winston.createLogger({
        level: environment.LOG_LEVEL,
        transports: [this.createConsoleTransport(environment.LOG_LEVEL)],
      });
    }

    return this._logger;
  }

  /**
   * Adds the file transport. Winston opens the file as soon as the transport
   * is constructed, so this is called only once the configuration is valid.
   * The path and level are the ones resolved at the logger's first use.
   */
  public enableFileLogging(): void {
    if (this.fileTransport) {
      return;
    }

    const logger = this.logger;

    this.fileTransport = new winston.transports.File(this.fileOptions);
    logger.add(this.fileTransport);
  }

  public attach(server: HttpAppProvider): void {
    this.server = server;
  }

  public run(prefix?: string): void {
    this.prefix = prefix || '';
    this.server?.app.use(
      expressWinston.logger({
        level: pigeonEnvironment().LOG_LEVEL,
        meta: false,
        msg: 'HTTP {{req.method}} {{res.statusCode}}',
        requestWhitelist: [],
        responseWhitelist: [],
        winstonInstance: this.logger,
      }),
    );
  }
}
