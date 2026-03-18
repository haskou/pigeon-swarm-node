import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local/mappers/LocalNodeMetadataMapper';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import { mock, MockProxy } from 'jest-mock-extended';

import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import LocalNodeRepository from '../../../../../../src/contexts/nodes/infrastructure/local/LocalNodeRepository';
import { IdentityMother } from '../../../../../../tests/unit/mothers/IdentityMother';
import { NetworkMother } from '../../../../../../tests/unit/mothers/NetworkMother';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

describe('LocalNodeRepository', () => {
  const canonicalNodeId = NodeId.generate().valueOf();
  const privateNetworkId = NetworkId.generate();
  const publicNetworkId = NetworkId.generate();
  const metadataFilePath = './ipfs_storage/node-metadata.json';

  let repository: LocalNodeRepository;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let mapper: LocalNodeMetadataMapper;

  beforeEach(() => {
    mapper = new LocalNodeMetadataMapper();
    networkRegistry = mock<IPFSNetworkRegistry>();
    repository = new LocalNodeRepository(networkRegistry, mapper);
    jest.clearAllMocks();
  });

  // Helper: Create IPFSNetwork mock from NetworkMother
  const createNetworkMock = (mother: NetworkMother): IPFSNetwork => {
    const network = mother.build();
    const primitives = network.toPrimitives();
    const mockNetwork = mock<IPFSNetwork>();
    mockNetwork.toPrimitives.mockReturnValue(primitives);

    return mockNetwork;
  };

  describe('loadLocalNode', () => {
    it('should load a node using persisted node id', async () => {
      // Arrange
      const privateNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withPrivateKey();

      const publicNetworkMother = new NetworkMother()
        .withId(publicNetworkId)
        .withoutKey();

      const privateNetwork = createNetworkMock(privateNetworkMother);
      const publicNetwork = createNetworkMock(publicNetworkMother);

      const owner = new IdentityMother().id;
      const ownerPem = owner.valueOf();

      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          nodeId: canonicalNodeId,
          owner: ownerPem,
        }),
      );
      networkRegistry.getAll.mockReturnValue([privateNetwork, publicNetwork]);

      // Act
      const localNode = await repository.loadLocalNode();

      // Assert
      expect(localNode.toPrimitives()).toEqual({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: privateNetworkMother
            .build()
            .toPrimitives(),
          [publicNetworkId.valueOf()]: publicNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: ownerPem,
      });
    });

    it('should create and persist a uuid node id when no metadata exists', async () => {
      // Arrange
      networkRegistry.getAll.mockReturnValue([]);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('not found'));

      // Act
      const localNode = await repository.loadLocalNode();
      const primitives = localNode.toPrimitives();

      // Assert
      expect(primitives.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        metadataFilePath,
        JSON.stringify({
          nodeId: primitives.id,
        }),
      );

      expect(primitives.networks).toEqual({});
      expect(primitives.owner).toBeUndefined();
    });
  });

  describe('saveLocalNode', () => {
    it('should register missing networks and unregister removed networks', async () => {
      // Arrange
      const desiredPrivateNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();

      const desiredPublicNetworkMother = new NetworkMother()
        .withId(publicNetworkId)
        .withName(new NetworkName('public'))
        .withoutKey();

      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: desiredPrivateNetworkMother
            .build()
            .toPrimitives(),
          [publicNetworkId.valueOf()]: desiredPublicNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
      });

      const currentPublic = mock<IPFSNetwork>();
      currentPublic.getName.mockReturnValue('public');
      currentPublic.getConfig.mockReturnValue(
        new IPFSNetworkConfig(publicNetworkId.valueOf(), 'public'),
      );

      const obsoletePrivate = mock<IPFSNetwork>();
      obsoletePrivate.getName.mockReturnValue('private_legacy');
      obsoletePrivate.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          new NetworkId('550e8400-e29b-41d4-a716-446655440002').valueOf(),
          'private_legacy',
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentPublic, obsoletePrivate]);

      // Act
      await repository.saveLocalNode(node);

      // Assert
      expect(fs.writeFile).toHaveBeenCalledWith(
        metadataFilePath,
        JSON.stringify({
          nodeId: canonicalNodeId,
        }),
      );

      expect(networkRegistry.initialize).toHaveBeenCalled();
      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith(
        'private_legacy',
      );
      expect(networkRegistry.register).toHaveBeenCalled();
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual(
        desiredPrivateNetworkMother.build().toPrimitives(),
      );
    });

    it('should recreate a network when its private key changes', async () => {
      // Arrange
      const desiredNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withPrivateKey();

      const { privateKey: differentPrivateKey } =
        generateKeyPairSync('ed25519');
      const differentKeyPem = differentPrivateKey
        .export({
          format: 'pem',
          type: 'pkcs8',
        })
        .toString();

      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: desiredNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
      });

      const currentNetwork = mock<IPFSNetwork>();
      currentNetwork.getName.mockReturnValue('private_0');
      currentNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          privateNetworkId.valueOf(),
          'private_0',
          new PrivateKey(differentKeyPem),
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentNetwork]);

      // Act
      await repository.saveLocalNode(node);

      // Assert
      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith('private_0');
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual(
        desiredNetworkMother.build().toPrimitives(),
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        metadataFilePath,
        JSON.stringify({
          nodeId: canonicalNodeId,
        }),
      );
    });

    it('should do nothing when helia is already synchronized with node networks', async () => {
      // Arrange
      const syncedNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();

      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: syncedNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
      });

      const currentNetwork = mock<IPFSNetwork>();
      const syncedNetworkPrimitives = syncedNetworkMother
        .build()
        .toPrimitives();
      currentNetwork.getName.mockReturnValue('private_0');
      currentNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          privateNetworkId.valueOf(),
          'private_0',
          new PrivateKey(syncedNetworkPrimitives.key as string),
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentNetwork]);

      // Act
      await repository.saveLocalNode(node);

      // Assert
      expect(networkRegistry.removeNetwork).not.toHaveBeenCalled();
      expect(networkRegistry.register).not.toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        metadataFilePath,
        JSON.stringify({
          nodeId: canonicalNodeId,
        }),
      );
    });
  });
});
