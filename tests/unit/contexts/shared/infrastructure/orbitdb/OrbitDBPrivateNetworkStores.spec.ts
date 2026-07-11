import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Kernel from '@haskou/ddd-kernel';
import { EventEmitter } from 'events';
import { mock, MockProxy } from 'jest-mock-extended';

function orbitDBDatabase(): OrbitDBDatabase {
  return {
    address: '/orbitdb/store',
    all: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
    events: new EventEmitter() as OrbitDBDatabase['events'],
    get: jest.fn().mockResolvedValue(undefined),
    put: jest.fn().mockResolvedValue('ok'),
    query: jest.fn().mockResolvedValue([]),
    sync: {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('OrbitDBPrivateNetworkStores', () => {
  let logger: MockProxy<WinstonLogger>;

  beforeEach(() => {
    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
    jest
      .spyOn(orbitDBRuntimeAdapter, 'createPrivateNetworkAccessController')
      .mockResolvedValue({});
    jest
      .spyOn(orbitDBRuntimeAdapter, 'createDocumentsDatabase')
      .mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle OrbitDB sync errors without throwing an unhandled EventEmitter error', async () => {
    const openedDatabases: OrbitDBDatabase[] = [];
    const orbitdb: OrbitDBInstance = {
      identity: { id: 'identity-1' },
      open: jest.fn().mockImplementation((): Promise<OrbitDBDatabase> => {
        const database = orbitDBDatabase();

        openedDatabases.push(database);

        return Promise.resolve(database);
      }),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const network = mock<IPFSNetwork>();

    network.getId.mockReturnValue('network-1');
    network.getPeerId.mockReturnValue('peer-1');
    network.getHeliaCore.mockReturnValue({} as never);
    jest
      .spyOn(orbitDBRuntimeAdapter, 'createOrbitDB')
      .mockResolvedValue(orbitdb);

    const stores = await OrbitDBPrivateNetworkStores.open(network);

    expect(orbitdb.open).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sync: false }),
    );

    await stores.startSynchronization();
    expect(openedDatabases.every((database) => database.sync?.start)).toBe(
      true,
    );
    expect(
      openedDatabases.every(
        (database) => (database.sync?.start as jest.Mock).mock.calls.length,
      ),
    ).toBe(true);

    (stores.calls.events as EventEmitter).emit('join', 'peer-2');
    expect(
      stores.getSynchronizationStores()[0].getSynchronizedPeerIds(),
    ).toEqual(['peer-2']);

    expect(stores.getSynchronizationStores().map(({ name }) => name)).toEqual([
      'calls',
      'communities',
      'contentReplication',
      'conversations',
      'heads',
      'identities',
      'keychains',
      'messages',
      'moderationLogs',
      'notifications',
      'notificationSettings',
      'pins',
      'polls',
      'reactions',
      'requests',
      'stickerPacks',
      'stickerUserLibraries',
    ]);

    expect(() => {
      (openedDatabases[0].events as EventEmitter).emit(
        'error',
        new Error(
          'LoadBlockFailedError: Failed to load block for bafyreie6lg4pgi2tr2uovjvf7yxauvlp7srcszjqyz3gws27ape6usggja',
        ),
      );
    }).not.toThrow();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'OrbitDB private network store sync error handled',
      ),
    );
  });
});
