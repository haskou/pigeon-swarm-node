import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeRegistrationModeChanger from '@app/contexts/nodes/application/change-registration-mode/NodeRegistrationModeChanger';
import { NodeRegistrationModeChangerMessage } from '@app/contexts/nodes/application/change-registration-mode/messages/NodeRegistrationModeChangerMessage';
import NodeRelayConfigurationUpdater from '@app/contexts/nodes/application/update-relay-configuration/NodeRelayConfigurationUpdater';
import { NodeRelayConfigurationUpdaterMessage } from '@app/contexts/nodes/application/update-relay-configuration/messages/NodeRelayConfigurationUpdaterMessage';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import NodeSaverService from '@app/contexts/nodes/domain/services/NodeSaverService';
import LocalNodeMetadataRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeMetadataRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';
import { promises as fs } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';
import os from 'os';
import path from 'path';
import { setImmediate } from 'timers/promises';

import { IdentityMother } from '../../../mothers/IdentityMother';

/**
 * Every owner write loads the node, changes one setting and saves it. Run
 * together against the real local database, none may revert another.
 */
describe('Concurrent node owner writes', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let repository: LocalNodeMetadataRepository;

  const freshRepository = (): LocalNodeMetadataRepository =>
    new LocalNodeMetadataRepository(
      new EmbeddedLocalDatabase(),
      networkRegistry,
      new LocalNodeMetadataMapper(),
    );

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-node-owner-writes-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    networkRegistry = mock<IPFSNetworkRegistry>();
    networkRegistry.getAll.mockReturnValue([]);
    repository = new LocalNodeMetadataRepository(
      database,
      networkRegistry,
      new LocalNodeMetadataMapper(),
    );
    await repository.loadLocalNode();
  });

  afterEach(async () => {
    await setImmediate();
    await database.close();

    if (previousPath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousPath;
    }

    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('should persist concurrent registration mode, relay, owner and network writes', async () => {
    const owner = new IdentityMother().id.valueOf();
    const networkId = NetworkId.generate();
    const modeRepository = freshRepository();
    const relayRepository = freshRepository();
    const ownerRepository = freshRepository();
    const networkRepository = freshRepository();

    await Promise.all([
      new NodeRegistrationModeChanger(
        new NodeLoaderService(modeRepository),
        new NodeSaverService(modeRepository),
        mock<LocalDomainEventPublisher>(),
      ).change(new NodeRegistrationModeChangerMessage('codes')),
      new NodeRelayConfigurationUpdater(
        new NodeLoaderService(relayRepository),
        new NodeSaverService(relayRepository),
        mock<DomainEventPublisher>(),
      ).update(
        new NodeRelayConfigurationUpdaterMessage({
          callsRelay: { port: 4199 },
        }),
      ),
      new NodeOwnerAssigner(
        new NodeLoaderService(ownerRepository),
        new NodeSaverService(ownerRepository),
        mock<NodeBlockPolicy>(),
      ).assignOwner(new NodeOwnerAssignerMessage(owner, owner)),
      new NodeNetworkAdder(
        new NodeLoaderService(networkRepository),
        new NodeSaverService(networkRepository),
        mock<DomainEventPublisher>(),
      ).addNetwork(
        new NodeNetworkAdderMessage(networkId.valueOf(), 'concurrent'),
      ),
    ]);

    const node = (await freshRepository().loadLocalNode()).toPrimitives();

    expect(node.registrationMode).toBe('codes');
    expect(node.relayConfiguration.callsRelay?.port).toBe(4199);
    expect(node.owner).toBe(owner);
    expect(Object.keys(node.networks)).toEqual([networkId.valueOf()]);
  });

  it('should keep one generated node when first loads race', async () => {
    await database.delete('node_metadata', 'local');

    const ids = await Promise.all(
      Array.from({ length: 5 }, async () =>
        (await freshRepository().loadLocalNodeId()).valueOf(),
      ),
    );

    expect(new Set(ids).size).toBe(1);
    expect(
      (await freshRepository().loadLocalNodeId()).valueOf(),
    ).toBe(ids[0]);
  });
});
