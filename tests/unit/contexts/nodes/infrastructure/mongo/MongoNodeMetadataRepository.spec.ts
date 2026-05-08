import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { NetworkKey } from '@app/contexts/nodes/domain/value-objects/NetworkKey';
import { MongoNodeMetadataDocument } from '@app/contexts/nodes/infrastructure/mongo/documents/MongoNodeMetadataDocument';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodeMetadataMapper from '@app/contexts/nodes/infrastructure/mongo/mappers/MongoNodeMetadataMapper';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { generateKeyPairSync } from 'crypto';
import { Collection } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NetworkMother } from '../../../../mothers/NetworkMother';

describe('MongoNodeMetadataRepository', () => {
  const oldPrivateKey = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const newPrivateKey = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const canonicalNodeId = NodeId.generate().valueOf();
  const privateNetworkId = NetworkId.generate();
  const publicNetworkId = NetworkId.generate();

  let repository: MongoNodeMetadataRepository;
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoNodeMetadataDocument>>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let mapper: MongoNodeMetadataMapper;

  beforeEach(() => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoNodeMetadataDocument>>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    mapper = new MongoNodeMetadataMapper();
    repository = new MongoNodeMetadataRepository(
      mongo,
      networkRegistry,
      mapper,
    );

    mongo.getCollection.mockResolvedValue(collection as never);
  });

  const createNetworkMock = (mother: NetworkMother): IPFSNetwork => {
    const network = mother.build();
    const primitives = network.toPrimitives();
    const mockNetwork = mock<IPFSNetwork>();
    const config = IPFSNetworkConfig.fromPrimitives(primitives);

    mockNetwork.getName.mockReturnValue(config.getName());
    mockNetwork.getConfig.mockReturnValue(config);
    mockNetwork.toPrimitives.mockReturnValue(primitives);

    return mockNetwork;
  };

  describe('loadLocalNode', () => {
    it('should load a node using persisted mongo metadata', async () => {
      const privateNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();
      const publicNetworkMother = new NetworkMother()
        .withId(publicNetworkId)
        .withName(new NetworkName('public_0'))
        .withoutKey();
      const owner = new IdentityMother().id;

      collection.findOne.mockResolvedValue({
        _id: 'local',
        networks: {
          [privateNetworkId.valueOf()]: privateNetworkMother
            .build()
            .toPrimitives(),
          [publicNetworkId.valueOf()]: publicNetworkMother
            .build()
            .toPrimitives(),
        },
        nodeId: canonicalNodeId,
        owner: owner.valueOf(),
      });
      networkRegistry.getAll.mockReturnValue([]);

      const localNode = await repository.loadLocalNode();

      expect(mongo.getCollection).toHaveBeenCalledWith('node_metadata');
      expect(collection.findOne).toHaveBeenCalledWith({ _id: 'local' });
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
        owner: owner.valueOf(),
      });
      expect(networkRegistry.initialize).toHaveBeenCalled();
      expect(networkRegistry.register).toHaveBeenCalledTimes(2);
    });

    it('should create and persist a node id when no metadata exists', async () => {
      collection.findOne.mockResolvedValue(null);
      networkRegistry.getAll.mockReturnValue([]);

      const localNode = await repository.loadLocalNode();
      const primitives = localNode.toPrimitives();

      expect(primitives.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(collection.updateOne).toHaveBeenCalledWith(
        { _id: 'local' },
        {
          $set: {
            networks: {},
            nodeId: primitives.id,
            owner: undefined,
          },
        },
        { upsert: true },
      );
      expect(primitives.networks).toEqual({});
      expect(primitives.owner).toBeUndefined();
    });
  });

  describe('saveLocalNode', () => {
    it('should persist metadata and register missing networks', async () => {
      const desiredPrivateNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();

      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: desiredPrivateNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
      });

      networkRegistry.getAll.mockReturnValue([]);

      await repository.saveLocalNode(node);

      expect(collection.updateOne).toHaveBeenCalledWith(
        { _id: 'local' },
        {
          $set: {
            networks: {
              [privateNetworkId.valueOf()]: desiredPrivateNetworkMother
                .build()
                .toPrimitives(),
            },
            nodeId: canonicalNodeId,
            owner: undefined,
          },
        },
        { upsert: true },
      );
      expect(networkRegistry.initialize).toHaveBeenCalled();
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual(
        desiredPrivateNetworkMother.build().toPrimitives(),
      );
    });

    it('should remove obsolete networks', async () => {
      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {},
        owner: undefined,
      });
      const obsoleteNetwork = mock<IPFSNetwork>();
      obsoleteNetwork.getName.mockReturnValue('private_legacy');
      obsoleteNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          new NetworkId('550e8400-e29b-41d4-a716-446655440002').valueOf(),
          'private_legacy',
        ),
      );
      networkRegistry.getAll.mockReturnValue([obsoleteNetwork]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith(
        'private_legacy',
      );
    });

    it('should recreate networks when the key changes', async () => {
      const currentNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey(new NetworkKey(oldPrivateKey));
      const targetNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey(new NetworkKey(newPrivateKey));
      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: targetNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
      });

      networkRegistry.getAll.mockReturnValue([
        createNetworkMock(currentNetworkMother),
      ]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith('private_0');
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual(
        targetNetworkMother.build().toPrimitives(),
      );
    });

    it('should keep already synchronized networks untouched', async () => {
      const networkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();
      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: networkMother.build().toPrimitives(),
        },
        owner: undefined,
      });

      networkRegistry.getAll.mockReturnValue([createNetworkMock(networkMother)]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.removeNetwork).not.toHaveBeenCalled();
      expect(networkRegistry.register).not.toHaveBeenCalled();
    });
  });
});
