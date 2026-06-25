import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import orbitDBRuntimeAdapter from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import Kernel from '@haskou/ddd-kernel';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
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
  };
}

describe('OrbitDBReplicatedStateStores', () => {
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

    await OrbitDBReplicatedStateStores.open(network);

    expect(() => {
      (openedDatabases[0].events as EventEmitter).emit(
        'error',
        new Error(
          'LoadBlockFailedError: Failed to load block for bafyreie6lg4pgi2tr2uovjvf7yxauvlp7srcszjqyz3gws27ape6usggja',
        ),
      );
    }).not.toThrow();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('OrbitDB replicated store sync error handled'),
    );
  });
});
