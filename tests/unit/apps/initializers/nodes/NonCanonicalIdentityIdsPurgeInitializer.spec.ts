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
      ownListNonCanonicalEntries: 0,
      removedEntries: 3,
    });

    await initializer.ensure();

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toBe(
      'Purged non-canonical identity ids: ownerCleared=true removedEntries=3 ownListNonCanonicalEntries=0',
    );
  });

  it('should warn that the node is unclaimed when it cleared the owner', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: true,
      ownListNonCanonicalEntries: 0,
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
      ownListNonCanonicalEntries: 0,
      removedEntries: 2,
    });

    await initializer.ensure();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should log nothing when nothing was purged', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: false,
      ownListNonCanonicalEntries: 0,
      removedEntries: 0,
    });

    await initializer.ensure();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should warn, with a count only, that its own list naming an alias is kept but not published', async () => {
    purger.purge.mockResolvedValue({
      ownerCleared: false,
      ownListNonCanonicalEntries: 2,
      removedEntries: 0,
    });

    await initializer.ensure();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const message = logger.warn.mock.calls[0][0];
    expect(message).toBe(
      'The node own block list holds 2 non-canonical identity ids: it is kept and enforced locally, NOT published, and must be re-signed with a higher version.',
    );
    expect(message).not.toMatch(/did:|[0-9a-f]{16,}|networkId|\/ip[46]\//i);
  });
});
