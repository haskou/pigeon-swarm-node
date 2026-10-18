import Kernel from '@haskou/ddd-kernel';
import type { HttpApp } from '@haskou/ddd-kernel/adapters/ui';
import express from 'express';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import winston from 'winston';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';

describe('HTTP log privacy', () => {
  it('logs status without client addresses, request headers, URLs, identities or response content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pigeon-http-log-'));
    const previous = {
      LOG_LEVEL: process.env.LOG_LEVEL,
      LOG_URL: process.env.LOG_URL,
      SERVICE_NAME: process.env.SERVICE_NAME,
    };
    Object.assign(process.env, {
      LOG_LEVEL: 'info',
      LOG_URL: '.',
      SERVICE_NAME: 'privacy-test',
    });
    jest.spyOn(Kernel, 'rootDirectory', 'get').mockReturnValue(directory);
    const captured: unknown[] = [];
    const loggers: winston.Logger[] = [];
    const createLogger = winston.createLogger;
    jest.spyOn(winston, 'createLogger').mockImplementation((options) => {
      const logger = createLogger(options);
      loggers.push(logger);
      return logger;
    });
    jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((info, callback) => {
        captured.push(info);
        if (typeof callback === 'function') callback();
      });
    const app = express();
    const logger = new WinstonLogger();
    logger.attach({ app: app as unknown as HttpApp });
    logger.run();
    logger.enableFileLogging();
    app.use(express.json());
    app.use((_request, response) =>
      response.status(404).json({ sdp: 'PRIVATE-SDP' }),
    );
    let server: Server | undefined;
    try {
      server = await new Promise<Server>((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/users/PRIVATE-IDENTITY?capability=PRIVATE-CAPABILITY`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer PRIVATE-TOKEN',
            cookie: 'session=PRIVATE-COOKIE',
            referer: 'https://example.test/PRIVATE-RELATIONSHIP',
            'content-type': 'application/json',
            'x-forwarded-for': 'PRIVATE-CLIENT-ADDRESS',
            'x-real-ip': 'PRIVATE-REAL-IP',
          },
          body: JSON.stringify({ message: 'PRIVATE-TEXT' }),
        },
      );
      expect(response.status).toBe(404);
      await response.text();
      await Promise.all(
        loggers.map(
          (instance) =>
            new Promise<void>((resolve) => {
              instance.on('finish', resolve);
              instance.end();
            }),
        ),
      );
      const file = await readFile(join(directory, 'privacy-test.log'), 'utf8');
      expect(captured.length).toBeGreaterThan(0);
      expect(file).toContain('HTTP POST 404');
      expect(JSON.stringify(captured)).toContain('HTTP POST 404');
      expect(file).not.toContain('PRIVATE-');
      expect(JSON.stringify(captured)).not.toContain('PRIVATE-');
      expect(file).not.toContain('127.0.0.1');
      expect(JSON.stringify(captured)).not.toContain('127.0.0.1');
    } finally {
      await new Promise<void>((resolve) =>
        server ? server.close(() => resolve()) : resolve(),
      );
      for (const instance of loggers) instance.close();
      jest.restoreAllMocks();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('WinstonLogger file transport', () => {
  const previous = {
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_URL: process.env.LOG_URL,
    SERVICE_NAME: process.env.SERVICE_NAME,
  };
  let directory: string;
  let captured: unknown[];

  const logFile = (): string => join(directory, 'file-transport-test.log');
  const closeLogger = (logger: WinstonLogger): Promise<void> => {
    const finished = Promise.withResolvers<void>();
    logger.logger.on('finish', finished.resolve);
    logger.logger.end();
    return finished.promise;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pigeon-file-transport-'));
    captured = [];
    Object.assign(process.env, {
      LOG_LEVEL: 'info',
      LOG_URL: '.',
      SERVICE_NAME: 'file-transport-test',
    });
    jest.spyOn(Kernel, 'rootDirectory', 'get').mockReturnValue(directory);
    jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((info, callback) => {
        captured.push(info);
        if (typeof callback === 'function') callback();
      });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });

  it('should keep the log file absent and print to the console until file logging is enabled', async () => {
    const logger = new WinstonLogger();

    logger.info('before validation');
    await closeLogger(logger);

    await expect(readFile(logFile(), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(JSON.stringify(captured)).toContain('before validation');
  });

  it('should write only the lines logged after file logging is enabled', async () => {
    const logger = new WinstonLogger();

    logger.info('before validation');
    await expect(readFile(logFile(), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    logger.enableFileLogging();
    logger.info('after validation');
    await closeLogger(logger);

    const file = await readFile(logFile(), 'utf8');
    expect(file).toContain('after validation');
    expect(file).not.toContain('before validation');
  });

  it('should send HTTP request logs through the file transport only once file logging is enabled', async () => {
    const app = express();
    const logger = new WinstonLogger();
    logger.attach({ app: app as unknown as HttpApp });
    logger.run();
    app.use((_request, response) => response.status(404).end());
    const started = Promise.withResolvers<void>();
    const server = app.listen(0, '127.0.0.1', () => started.resolve());
    await started.promise;
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const get = async (): Promise<number> => {
      const response = await fetch(url);
      await response.text();
      return response.status;
    };
    try {
      expect(await get()).toBe(404);
      // Gives any file transport opened by the HTTP path time to create the file.
      const settled = Promise.withResolvers<void>();
      setTimeout(settled.resolve, 50);
      await settled.promise;
      await expect(readFile(logFile(), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(JSON.stringify(captured)).toContain('HTTP GET 404');

      logger.enableFileLogging();
      expect(await get()).toBe(404);
      await closeLogger(logger);

      const file = await readFile(logFile(), 'utf8');
      expect(file.match(/HTTP GET 404/g)).toHaveLength(1);
    } finally {
      const closed = Promise.withResolvers<void>();
      server.close(() => closed.resolve());
      await closed.promise;
    }
  });
});
