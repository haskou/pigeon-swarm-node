/* eslint-disable @typescript-eslint/no-unused-vars */
import winston, { Logger, format } from 'winston';
import expressWinston from 'express-winston';
import Kernel from '@app/Kernel';
import Log from './Log';
import Server from '../express/Server';

export default class WinstonLogger implements Log {
  private prefix: string = '';
  private readonly opts = {
    level: process.env.LOG_LEVEL,
    format: format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      format.json(),
    ),
    transports: [
      new winston.transports.Console({ level: process.env.LOG_LEVEL }),
      new winston.transports.File({
        level: process.env.LOG_LEVEL,
        // eslint-disable-next-line max-len
        filename: `${Kernel.rootDirectory}/${process.env.LOG_URL || 'logs'}/${process.env.SERVICE_NAME || 'service'}.log`,
      }),
    ],
  };

  private _logger: Logger;

  constructor(private readonly server?: Server) {}

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
