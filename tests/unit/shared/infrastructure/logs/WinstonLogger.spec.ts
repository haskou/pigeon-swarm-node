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
  it('logs status without request headers, URLs, identities or response content', async () => {
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
