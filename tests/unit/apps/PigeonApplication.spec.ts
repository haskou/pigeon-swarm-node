import 'reflect-metadata';
import DiagnosticsTraceInitializer from '@app/apps/initializers/diagnostics/DiagnosticsTraceInitializer';
import PigeonApplication from '@app/apps/PigeonApplication';
import { DEVICE_SEALING_RECORD_HEAD_PREFIX } from '@app/contexts/identity-devices/domain/DeviceSealingRecord';
import { DeviceSealingRecordRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealingRecordRepository';
import OrbitDBDeviceSealingRecordRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceSealingRecordRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { Kernel } from '@haskou/ddd-kernel';
import { mock } from 'jest-mock-extended';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { setTimeout } from 'timers/promises';
import winston from 'winston';

const INITIALIZER_TIMEOUT_MS = 50;

const withinASecond = async <T>(pending: Promise<T>): Promise<T> =>
  Promise.race([
    pending,
    setTimeout(1000, undefined, { ref: false }).then((): never => {
      throw new Error('Still waiting after a second');
    }),
  ]);

class HangingInitializer implements Initializer {
  public ensure(): Promise<void> {
    return new Promise<void>(() => undefined);
  }
}

describe('PigeonApplication initializers', () => {
  let application: PigeonApplication;
  let finishing: Initializer;

  beforeEach(() => {
    application = new PigeonApplication();
    finishing = mock<Initializer>({
      ensure: jest.fn().mockResolvedValue(undefined),
    });
    jest
      .spyOn(Kernel.prototype, 'environment', 'get')
      .mockReturnValue({ NODE_INITIALIZER_TIMEOUT_MS: INITIALIZER_TIMEOUT_MS });
    jest.spyOn(Kernel.prototype, 'di', 'get').mockReturnValue({
      // Any other initializer stands for one that finishes in time.
      getService: (ClassDefinition: unknown) =>
        ClassDefinition === HangingInitializer
          ? new HangingInitializer()
          : finishing,
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fail startup when an initializer does not finish in time, naming the initializer and the bound only', async () => {
    await expect(
      withinASecond(
        application.runInitializers(
          HangingInitializer,
          DiagnosticsTraceInitializer,
        ),
      ),
    ).rejects.toMatchObject({
      message: `Initializer HangingInitializer did not finish within ${INITIALIZER_TIMEOUT_MS} ms`,
    });
    expect(finishing.ensure).not.toHaveBeenCalled();
  });

  it('should run every initializer that finishes in time', async () => {
    await expect(
      withinASecond(
        application.runInitializers(
          DiagnosticsTraceInitializer,
          DiagnosticsTraceInitializer,
        ),
      ),
    ).resolves.toBeUndefined();
    expect(finishing.ensure).toHaveBeenCalledTimes(2);
  });
});

describe('PigeonApplication kernel-loaded environment', () => {
  const previous = { ...process.env };
  const logFileName = 'application-log-test.log';
  const closedLoggers = new WeakSet<WinstonLogger>();
  let directory: string;
  let printed: unknown[];

  const closeLogger = (logger: WinstonLogger): Promise<void> => {
    if (closedLoggers.has(logger)) {
      return Promise.resolve();
    }
    closedLoggers.add(logger);
    const finished = Promise.withResolvers<void>();
    logger.logger.on('finish', finished.resolve);
    logger.logger.end();
    return finished.promise;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pigeon-application-log-'));
    printed = [];
    Object.assign(process.env, {
      LOG_LEVEL: 'info',
      LOG_URL: relative(process.cwd(), directory),
      SERVICE_NAME: 'application-log-test',
    });
    jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((info, callback) => {
        printed.push(info);
        if (typeof callback === 'function') callback();
      });
  });

  afterEach(async () => {
    process.env = { ...previous };
    await closeLogger(Kernel.logger as WinstonLogger);
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('should keep the log file absent until the environment is valid', async () => {
    const application = new PigeonApplication();
    const logger = Kernel.logger as WinstonLogger;
    logger.info('before validation');
    process.env.NODE_INITIALIZER_TIMEOUT_MS = '0';

    expect(() => application.loadEnvironmentVariables()).toThrow(
      'Environment variable "NODE_INITIALIZER_TIMEOUT_MS" must be an integer from 1 to 2147483647.',
    );
    logger.info('after failed validation');
    await closeLogger(logger);

    await expect(
      readFile(join(directory, logFileName), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.stringify(printed)).toContain('before validation');
  });

  it('should write only the lines logged once the environment is valid', async () => {
    process.env.NODE_INITIALIZER_TIMEOUT_MS = '2147483647';
    const application = new PigeonApplication();
    const logger = Kernel.logger as WinstonLogger;
    logger.info('before validation');
    await expect(
      readFile(join(directory, logFileName), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    application.loadEnvironmentVariables();
    logger.info('after validation');
    await closeLogger(logger);

    const file = await readFile(join(directory, logFileName), 'utf8');
    expect(file).toContain('after validation');
    expect(file).not.toContain('before validation');
  });

  it.each([['0'], ['-1'], ['1.5'], ['2147483648']])(
    'should fail loading the environment when NODE_INITIALIZER_TIMEOUT_MS is %s',
    (raw) => {
      process.env.NODE_INITIALIZER_TIMEOUT_MS = raw;

      expect(() => new PigeonApplication().loadEnvironmentVariables()).toThrow(
        'Environment variable "NODE_INITIALIZER_TIMEOUT_MS" must be an integer from 1 to 2147483647.',
      );
    },
  );

  it('should load the environment when NODE_INITIALIZER_TIMEOUT_MS is 2147483647', () => {
    process.env.NODE_INITIALIZER_TIMEOUT_MS = '2147483647';

    expect(() =>
      new PigeonApplication().loadEnvironmentVariables(),
    ).not.toThrow();
  });

  it.each([['0'], ['-1'], ['1.5'], ['10001']])(
    'should fail loading the environment when SERVED_SLOTS_PER_SOURCE is %s',
    (raw) => {
      process.env.SERVED_SLOTS_PER_SOURCE = raw;

      expect(() => new PigeonApplication().loadEnvironmentVariables()).toThrow(
        'Environment variable "SERVED_SLOTS_PER_SOURCE" must be an integer from 1 to 10000.',
      );
    },
  );

  it.each([['many'], ['12abc']])(
    'should fail loading the environment when SERVED_SLOTS_PER_SOURCE is %s',
    (raw) => {
      process.env.SERVED_SLOTS_PER_SOURCE = raw;

      expect(() => new PigeonApplication().loadEnvironmentVariables()).toThrow(
        `Environment variable "SERVED_SLOTS_PER_SOURCE" has invalid number value "${raw}".`,
      );
    },
  );

  it('should load the environment with the default when SERVED_SLOTS_PER_SOURCE is blank', () => {
    process.env.SERVED_SLOTS_PER_SOURCE = '';

    expect(() =>
      new PigeonApplication().loadEnvironmentVariables(),
    ).not.toThrow();
  });

  it('should load the environment when SERVED_SLOTS_PER_SOURCE is 10000', () => {
    process.env.SERVED_SLOTS_PER_SOURCE = '10000';

    expect(() =>
      new PigeonApplication().loadEnvironmentVariables(),
    ).not.toThrow();
  });
});

describe('PigeonApplication local node state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers the sealing record merger before replicated state replays', async () => {
    const registry = mock<OrbitDBReplicatedStateRegistry>();
    const loadNode = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Kernel.prototype, 'di', 'get').mockReturnValue({
      getService: (ClassDefinition: unknown) => {
        if (ClassDefinition === NodeLoader) return { loadNode };
        if (ClassDefinition === DeviceSealingRecordRepository)
          return new OrbitDBDeviceSealingRecordRepository(
            registry,
            mock<IPFSNetworkRegistry>(),
          );
        throw new Error('Unexpected service');
      },
    } as never);

    await new PigeonApplication().loadLocalNodeState();

    expect(registry.registerHeadRecordMerger).toHaveBeenCalledWith(
      DEVICE_SEALING_RECORD_HEAD_PREFIX,
      expect.any(Function),
      expect.any(Function),
    );
    expect(
      registry.registerHeadRecordMerger.mock.invocationCallOrder[0],
    ).toBeLessThan(loadNode.mock.invocationCallOrder[0]);
  });
});
