import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { NetworkKey } from '@app/contexts/nodes/domain/value-objects/NetworkKey';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import LocalNodeMetadataRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeMetadataRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { generateKeyPairSync } from 'crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NetworkMother } from '../../../../mothers/NetworkMother';

describe('LocalNodeMetadataRepository', () => {
  const oldPrivateKey = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const newPrivateKey = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const canonicalNodeId = NodeId.generate().valueOf();
  const privateNetworkId = NetworkId.generate();
  const publicNetworkId = NetworkId.generate();
  const defaultRelayConfiguration =
    NodeRelayConfiguration.default().toPrimitives();

  let repository: LocalNodeMetadataRepository;
  let database: MockProxy<EmbeddedLocalDatabase>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    repository = new LocalNodeMetadataRepository(
      database,
      networkRegistry,
      new LocalNodeMetadataMapper(),
    );
  });

  const createNetworkMock = (mother: NetworkMother): IPFSNetwork => {
    const network = mother.build();
    const primitives = network.toPrimitives();
    const mockNetwork = mock<IPFSNetwork>();
    const config = IPFSNetworkConfig.fromPrimitives(primitives);

    mockNetwork.getName.mockReturnValue(config.getName());
    mockNetwork.getId.mockReturnValue(config.getId());
    mockNetwork.getConfig.mockReturnValue(config);
    mockNetwork.toPrimitives.mockReturnValue(primitives);

    return mockNetwork;
  };

  describe('loadLocalNode', () => {
    it('should load a node using persisted local metadata', async () => {
      const privateNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();
      const publicNetworkMother = new NetworkMother()
        .withId(publicNetworkId)
        .withName(new NetworkName('public_0'))
        .withoutKey();
      const owner = new IdentityMother().id;

      database.findOne.mockResolvedValue({
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
        relayConfiguration: defaultRelayConfiguration,
      });
      networkRegistry.getAll.mockReturnValue([]);

      const localNode = await repository.loadLocalNode();

      expect(database.findOne).toHaveBeenCalledWith('node_metadata', 'local');
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
        relayConfiguration: defaultRelayConfiguration,
      });
      expect(networkRegistry.initialize).toHaveBeenCalled();
      expect(networkRegistry.register).toHaveBeenCalledTimes(2);
    });

    it('should create and persist a node id when no metadata exists', async () => {
      database.findOne.mockResolvedValue(undefined);
      networkRegistry.getAll.mockReturnValue([]);

      const localNode = await repository.loadLocalNode();
      const primitives = localNode.toPrimitives();

      expect(primitives.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(database.save).toHaveBeenCalledWith('node_metadata', 'local', {
        _id: 'local',
        networks: {},
        nodeId: primitives.id,
        relayConfiguration: defaultRelayConfiguration,
      });
      expect(primitives.networks).toEqual({});
      expect(primitives.owner).toBeUndefined();
      expect(primitives.relayConfiguration).toEqual(defaultRelayConfiguration);
    });
  });

  describe('saveLocalNode', () => {
    it('should persist metadata and register missing networks in background', async () => {
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
        relayConfiguration: defaultRelayConfiguration,
      });

      networkRegistry.getAll.mockReturnValue([]);

      await repository.saveLocalNode(node);

      expect(database.save).toHaveBeenCalledWith(
        'node_metadata',
        'local',
        expect.objectContaining({
          networks: {
            [privateNetworkId.valueOf()]: desiredPrivateNetworkMother
              .build()
              .toPrimitives(),
          },
          nodeId: canonicalNodeId,
          relayConfiguration: defaultRelayConfiguration,
        }),
      );
      await flushPromises();
      expect(networkRegistry.initialize).toHaveBeenCalled();
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual(
        desiredPrivateNetworkMother.build().toPrimitives(),
      );
    });

    it('should not wait for missing network registration before resolving', async () => {
      const delayedRegistration = deferred<IPFSNetwork>();
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
        relayConfiguration: defaultRelayConfiguration,
      });

      networkRegistry.getAll.mockReturnValue([]);
      networkRegistry.register.mockReturnValue(delayedRegistration.promise);

      await expect(repository.saveLocalNode(node)).resolves.toBeUndefined();
      expect(database.save).toHaveBeenCalled();
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);

      delayedRegistration.resolve(
        createNetworkMock(desiredPrivateNetworkMother),
      );
      await delayedRegistration.promise;
    });

    it('should synchronize background networks from the latest saved metadata', async () => {
      const delayedInitialization = deferred<void>();
      const firstNetworkMother = new NetworkMother()
        .withId(privateNetworkId)
        .withName(new NetworkName('private_0'))
        .withPrivateKey();
      const secondNetworkMother = new NetworkMother()
        .withId(publicNetworkId)
        .withName(new NetworkName('public_0'))
        .withoutKey();
      const firstNode = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: firstNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
        relayConfiguration: defaultRelayConfiguration,
      });
      const latestNode = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId.valueOf()]: firstNetworkMother
            .build()
            .toPrimitives(),
          [publicNetworkId.valueOf()]: secondNetworkMother
            .build()
            .toPrimitives(),
        },
        owner: undefined,
        relayConfiguration: defaultRelayConfiguration,
      });

      networkRegistry.initialize.mockReturnValue(delayedInitialization.promise);
      networkRegistry.getAll.mockReturnValue([]);

      await repository.saveLocalNode(firstNode);
      await repository.saveLocalNode(latestNode);

      delayedInitialization.resolve(undefined);
      await flushPromises();

      const registeredNetworkIds = networkRegistry.register.mock.calls.map(
        ([config]) => config.getId(),
      );

      expect(registeredNetworkIds).toContain(privateNetworkId.valueOf());
      expect(registeredNetworkIds).toContain(publicNetworkId.valueOf());
    });

    it('should remove obsolete networks', async () => {
      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {},
        owner: undefined,
        relayConfiguration: defaultRelayConfiguration,
      });
      const obsoleteNetwork = mock<IPFSNetwork>();
      const obsoleteNetworkId = '550e8400-e29b-41d4-a716-446655440002';

      obsoleteNetwork.getId.mockReturnValue(obsoleteNetworkId);
      obsoleteNetwork.getName.mockReturnValue('private_legacy');
      obsoleteNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(obsoleteNetworkId, 'private_legacy'),
      );
      networkRegistry.getAll.mockReturnValue([obsoleteNetwork]);

      await repository.saveLocalNode(node);

      await flushPromises();
      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith(
        obsoleteNetworkId,
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
        relayConfiguration: defaultRelayConfiguration,
      });

      networkRegistry.getAll.mockReturnValue([
        createNetworkMock(currentNetworkMother),
      ]);

      await repository.saveLocalNode(node);

      await flushPromises();
      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith(
        privateNetworkId.valueOf(),
      );
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
        relayConfiguration: defaultRelayConfiguration,
      });

      networkRegistry.getAll.mockReturnValue([
        createNetworkMock(networkMother),
      ]);

      await repository.saveLocalNode(node);

      await flushPromises();
      expect(networkRegistry.removeNetwork).not.toHaveBeenCalled();
      expect(networkRegistry.register).not.toHaveBeenCalled();
    });

    it('should recreate private networks when relay settings change', async () => {
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
        relayConfiguration: NodeRelayConfiguration.fromPrimitives({
          privateRelay: {
            enabled: true,
            portEnd: 4199,
            portStart: 4100,
            publicRecordDiscoveryEnabled: true,
            publicRecordPublicationEnabled: true,
          },
        }).toPrimitives(),
      });

      networkRegistry.configureRelaySettings.mockReturnValue(true);
      networkRegistry.getAll.mockReturnValue([createNetworkMock(networkMother)]);

      await repository.saveLocalNode(node);
      await flushPromises();

      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith(
        privateNetworkId.valueOf(),
      );
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);
    });
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
