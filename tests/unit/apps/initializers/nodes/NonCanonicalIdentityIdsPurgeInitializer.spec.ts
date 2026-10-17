import NonCanonicalIdentityIdsPurgeInitializer from '@app/apps/initializers/nodes/NonCanonicalIdentityIdsPurgeInitializer';
import NonCanonicalIdentityIdsPurger from '@app/contexts/nodes/application/purge-non-canonical-identity-ids/NonCanonicalIdentityIdsPurger';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Kernel from '@haskou/ddd-kernel';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NonCanonicalIdentityIdsPurgeInitializer', () => {
  let purger: MockProxy<NonCanonicalIdentityIdsPurger>;
  let logger: MockProxy<WinstonLogger>;
  let initializer: NonCanonicalIdentityIdsPurgeInitializer;

  beforeEach(() => {
    purger = mock<NonCanonicalIdentityIdsPurger>();
    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
    initializer = new NonCanonicalIdentityIdsPurgeInitializer(purger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log what it purged as counts only', async () => {
    purger.purge.mockResolvedValue({ ownerCleared: true, removedEntries: 3 });

    await initializer.ensure();

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toBe(
      'Purged non-canonical identity ids: ownerCleared=true removedEntries=3',
    );
  });

  it('should log nothing when nothing was purged', async () => {
    purger.purge.mockResolvedValue({ ownerCleared: false, removedEntries: 0 });

    await initializer.ensure();

    expect(logger.info).not.toHaveBeenCalled();
  });
});
