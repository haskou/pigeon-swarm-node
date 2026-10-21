import { applicationInitializers } from '@app/apps/ApplicationInitializers';
import NonCanonicalIdentityIdsPurgeInitializer from '@app/apps/initializers/nodes/NonCanonicalIdentityIdsPurgeInitializer';
import PigeonApplication from '@app/apps/PigeonApplication';
import { init, installShutdownSignalHandlers } from '@app/index';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Kernel from '@haskou/ddd-kernel';
import { EventEmitter } from 'events';
import { mock, MockProxy } from 'jest-mock-extended';

describe('index', () => {
  let application: MockProxy<PigeonApplication>;

  beforeEach(() => {
    application = mock<PigeonApplication>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(mock<WinstonLogger>());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should purge non-canonical identity ids before any other initializer', () => {
    expect(applicationInitializers[0]).toBe(
      NonCanonicalIdentityIdsPurgeInitializer,
    );
  });

  it('should serve no request until every initializer has finished, so no owner change races the startup purge', async () => {
    let finishInitializers: () => void = () => undefined;

    application.runInitializers.mockReturnValue(
      new Promise<void>((resolve) => {
        finishInitializers = resolve;
      }),
    );

    const started = init(application);

    await new Promise(setImmediate);

    expect(application.runInitializers).toHaveBeenCalledWith(
      ...applicationInitializers,
    );
    expect(application.runServer).not.toHaveBeenCalled();

    finishInitializers();
    await started;

    expect(application.runServer).toHaveBeenCalledTimes(1);
  });
});

describe('installShutdownSignalHandlers', () => {
  const flushMicrotasks = async (): Promise<void> => {
    for (let index = 0; index < 20; index++) {
      await Promise.resolve();
    }
  };

  let application: MockProxy<PigeonApplication>;
  let signalSource: EventEmitter;
  let exit: jest.Mock<void, [number]>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(mock<WinstonLogger>());
    application = mock<PigeonApplication>();
    application.shutdown.mockResolvedValue(undefined);
    signalSource = new EventEmitter();
    exit = jest.fn();
    installShutdownSignalHandlers(application, signalSource, exit);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each(['SIGTERM', 'SIGINT'])(
    'should shut the application down and exit 0 on %s',
    async (signal) => {
      signalSource.emit(signal);
      await flushMicrotasks();

      expect(application.shutdown).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
    },
  );

  it('should run the shutdown once when a second signal arrives while it is pending', async () => {
    signalSource.emit('SIGTERM');
    signalSource.emit('SIGINT');
    await flushMicrotasks();

    expect(application.shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('should exit 1 when the shutdown fails', async () => {
    application.shutdown.mockRejectedValue(new Error('store close failed'));

    signalSource.emit('SIGTERM');
    await flushMicrotasks();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('should exit 1 when the shutdown does not finish within the stop budget', async () => {
    application.shutdown.mockReturnValue(new Promise<void>(() => undefined));

    signalSource.emit('SIGTERM');
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    expect(exit).toHaveBeenCalledWith(1);
  });
});
