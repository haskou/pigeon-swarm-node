import 'reflect-metadata';
import DiagnosticsTraceInitializer from '@app/apps/initializers/diagnostics/DiagnosticsTraceInitializer';
import PigeonApplication from '@app/apps/PigeonApplication';
import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { Kernel } from '@haskou/ddd-kernel';
import { mock } from 'jest-mock-extended';
import { setTimeout } from 'timers/promises';

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

  afterEach(() => {
    process.env = { ...previous };
  });

  let enableFileLogging: jest.SpyInstance;

  beforeEach(() => {
    enableFileLogging = jest
      .spyOn(WinstonLogger.prototype, 'enableFileLogging')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should keep the log file closed when the environment is invalid', () => {
    process.env.NODE_INITIALIZER_TIMEOUT_MS = '0';

    expect(() => new PigeonApplication().loadEnvironmentVariables()).toThrow();
    expect(enableFileLogging).not.toHaveBeenCalled();
  });

  it('should open the log file once the environment is valid', () => {
    process.env.NODE_INITIALIZER_TIMEOUT_MS = '2147483647';

    new PigeonApplication().loadEnvironmentVariables();

    expect(enableFileLogging).toHaveBeenCalledTimes(1);
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
