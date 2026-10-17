import { applicationInitializers } from '@app/apps/ApplicationInitializers';
import NonCanonicalIdentityIdsPurgeInitializer from '@app/apps/initializers/nodes/NonCanonicalIdentityIdsPurgeInitializer';
import PigeonApplication from '@app/apps/PigeonApplication';
import { init } from '@app/index';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Kernel from '@haskou/ddd-kernel';
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
