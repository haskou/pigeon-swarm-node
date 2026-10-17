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
    purger.purge.mockResolvedValue({
      ownerCleared: true,
      ownListDropped: false,
      removedEntries: 3,
    });

    await initializer.ensure();

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toBe(
      'Purged non-canonical identity ids: ownerCleared=true ownListDropped=false removedEntries=3',
    );
  });

  it('should warn that the node is unclaimed when it cleared the owner', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: true,
      ownListDropped: false,
      removedEntries: 0,
    });

    await initializer.ensure();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toBe(
      'The stored node owner was not a canonical identity id and was cleared: this node is unclaimed and the first signed PUT /node/owner claims it. Stop the node and run yarn node:reset-owner <owner identity id> to name the owner.',
    );
  });

  it('should not warn when it kept the owner', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: false,
      ownListDropped: false,
      removedEntries: 2,
    });

    await initializer.ensure();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should log nothing when nothing was purged', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: false,
      ownListDropped: false,
      removedEntries: 0,
    });

    await initializer.ensure();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should log that it dropped its own list naming an alias', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: false,
      ownListDropped: true,
      removedEntries: 0,
    });

    await initializer.ensure();

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toBe(
      'Purged non-canonical identity ids: ownerCleared=false ownListDropped=true removedEntries=0',
    );
  });
});
