import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import { NodeRegistrationModeChangerMessage } from '@app/contexts/nodes/application/change-registration-mode/messages/NodeRegistrationModeChangerMessage';
import NodeRegistrationModeChanger from '@app/contexts/nodes/application/change-registration-mode/NodeRegistrationModeChanger';
import { NodeOwnerWriteHolderMessage } from '@app/contexts/nodes/application/hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import { NodeNetworkRemoverMessage } from '@app/contexts/nodes/application/remove-network/messages/NodeNetworkRemoverMessage';
import NodeNetworkRemover from '@app/contexts/nodes/application/remove-network/NodeNetworkRemover';
import { NodeRelayConfigurationUpdaterMessage } from '@app/contexts/nodes/application/update-relay-configuration/messages/NodeRelayConfigurationUpdaterMessage';
import NodeRelayConfigurationUpdater from '@app/contexts/nodes/application/update-relay-configuration/NodeRelayConfigurationUpdater';
import { NodeCanOnlyBeManagedByItsOwnerError } from '@app/contexts/nodes/domain/errors/NodeCanOnlyBeManagedByItsOwnerError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeNetworkDataCleaner from '@app/contexts/nodes/domain/services/NodeNetworkDataCleaner';
import LocalNodeMetadataRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeMetadataRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import KeyedSerialSectionIsNestedError from '@app/shared/infrastructure/concurrency/KeyedSerialSectionIsNestedError';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';
import { promises as fs } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';
import os from 'os';
import path from 'path';
import { setImmediate, setTimeout } from 'timers/promises';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';

/**
 * Every owner write loads the node, changes one setting and saves it. Run
 * together against the real local database, none may revert another, and none
 * of a former owner may land once the node was handed over.
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

  /** Hands the node from its first owner to the second; returns both. */
  const handOver = async (): Promise<[string, string]> => {
    const former = IdentityIdMother.canonical().valueOf();
    const current = IdentityIdMother.canonical().valueOf();
    const assigner = new NodeOwnerAssigner(
      freshRepository(),
      mock<NodeBlockPolicy>(),
    );

    await assigner.assignOwner(new NodeOwnerAssignerMessage(former, former));
    await assigner.assignOwner(new NodeOwnerAssignerMessage(current, former));

    return [former, current];
  };

  /** `entered` settles once the gated step waits; `release` lets it go on. */
  const gate = (): {
    entered: Promise<void>;
    release: () => void;
    wait: () => Promise<void>;
  } => {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    return {
      entered,
      release,
      wait: async () => {
        enter();
        await released;
      },
    };
  };

  /** Settles like `pending`, or rejects once it waited a second, never hangs. */
  const withinASecond = async <T>(pending: Promise<T>): Promise<T> =>
    Promise.race([
      pending,
      setTimeout(1000, undefined, { ref: false }).then((): never => {
        throw new Error('Still waiting after a second');
      }),
    ]);

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

  it('should persist concurrent registration mode, relay and network writes', async () => {
    const [, owner] = await handOver();
    const networkId = NetworkId.generate();

    await Promise.all([
      new NodeRegistrationModeChanger(
        freshRepository(),
        mock<LocalDomainEventPublisher>(),
      ).change(new NodeRegistrationModeChangerMessage('codes', owner)),
      new NodeRelayConfigurationUpdater(
        freshRepository(),
        mock<DomainEventPublisher>(),
      ).update(
        new NodeRelayConfigurationUpdaterMessage(
          { callsRelay: { port: 4199 } },
          owner,
        ),
      ),
      new NodeNetworkAdder(
        freshRepository(),
        mock<DomainEventPublisher>(),
      ).addNetwork(
        new NodeNetworkAdderMessage(
          networkId.valueOf(),
          'concurrent',
          undefined,
          owner,
        ),
      ),
    ]);

    const node = (await freshRepository().loadLocalNode()).toPrimitives();

    expect(node.registrationMode).toBe('codes');
    expect(node.relayConfiguration.callsRelay?.port).toBe(4199);
    expect(node.owner).toBe(owner);
    expect(Object.keys(node.networks)).toEqual([networkId.valueOf()]);
  });

  it('should refuse every node setting write of a former owner', async () => {
    const networkId = NetworkId.generate();
    const adder = new NodeNetworkAdder(
      freshRepository(),
      mock<DomainEventPublisher>(),
    );
    const cleaner = mock<NodeNetworkDataCleaner>();
    const [former] = await handOver();
    const before = (await freshRepository().loadLocalNode()).toPrimitives();

    await expect(
      new NodeRegistrationModeChanger(
        freshRepository(),
        mock<LocalDomainEventPublisher>(),
      ).change(new NodeRegistrationModeChangerMessage('closed', former)),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);
    await expect(
      new NodeRelayConfigurationUpdater(
        freshRepository(),
        mock<DomainEventPublisher>(),
      ).update(
        new NodeRelayConfigurationUpdaterMessage(
          { callsRelay: { port: 4199 } },
          former,
        ),
      ),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);
    await expect(
      adder.addNetwork(
        new NodeNetworkAdderMessage(
          networkId.valueOf(),
          'former',
          undefined,
          former,
        ),
      ),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);
    await expect(
      adder.addNetwork(
        new NodeNetworkAdderMessage(undefined, 'public', undefined, former),
      ),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);
    await expect(
      new NodeNetworkRemover(
        freshRepository(),
        cleaner,
        mock<DomainEventPublisher>(),
      ).remove(new NodeNetworkRemoverMessage(networkId.valueOf(), former)),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);

    expect((await freshRepository().loadLocalNode()).toPrimitives()).toEqual(
      before,
    );
    expect(cleaner.clean).not.toHaveBeenCalled();
  });

  it('should refuse a held write of a former owner without running it', async () => {
    const [former] = await handOver();
    const write = jest.fn();

    await expect(
      new NodeOwnerWriteHolder(freshRepository()).hold(
        new NodeOwnerWriteHolderMessage(former),
        write,
      ),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);
    expect(write).not.toHaveBeenCalled();
  });

  it('should refuse a held write on a node nobody claimed', async () => {
    const write = jest.fn();

    await expect(
      new NodeOwnerWriteHolder(freshRepository()).hold(
        new NodeOwnerWriteHolderMessage(IdentityIdMother.canonical().valueOf()),
        write,
      ),
    ).rejects.toThrow(NodeCanOnlyBeManagedByItsOwnerError);
    expect(write).not.toHaveBeenCalled();
  });

  it('should land a handover only after the owner write it raced', async () => {
    const [, owner] = await handOver();
    const next = IdentityIdMother.canonical().valueOf();
    const writing = gate();
    const landed: string[] = [];

    const write = new NodeOwnerWriteHolder(freshRepository()).hold(
      new NodeOwnerWriteHolderMessage(owner),
      async () => {
        await writing.wait();
        landed.push('write');

        return 'written';
      },
    );
    await writing.entered;
    const handover = new NodeOwnerAssigner(
      freshRepository(),
      mock<NodeBlockPolicy>(),
    )
      .assignOwner(new NodeOwnerAssignerMessage(next, owner))
      .then(() => landed.push('handover'));
    await setTimeout(100);
    writing.release();

    await expect(write).resolves.toBe('written');
    await handover;
    expect(landed).toEqual(['write', 'handover']);
  });

  it('should refuse a node update or hold nested in a hold at once and stay usable', async () => {
    const change = jest.fn();
    const nestedAction = jest.fn();
    const owner = IdentityIdMother.canonical().valueOf();

    await repository.holdLocalNode(async () => {
      await expect(
        withinASecond(freshRepository().updateLocalNode(change)),
      ).rejects.toThrow(KeyedSerialSectionIsNestedError);
      await expect(
        withinASecond(repository.updateStoppedLocalNode(change)),
      ).rejects.toThrow(KeyedSerialSectionIsNestedError);
      await expect(
        withinASecond(repository.holdLocalNode(nestedAction)),
      ).rejects.toThrow(KeyedSerialSectionIsNestedError);
    });
    await withinASecond(
      new NodeOwnerAssigner(
        freshRepository(),
        mock<NodeBlockPolicy>(),
      ).assignOwner(new NodeOwnerAssignerMessage(owner, owner)),
    );

    expect(change).not.toHaveBeenCalled();
    expect(nestedAction).not.toHaveBeenCalled();
    await expect(
      withinASecond(
        freshRepository().holdLocalNode((node) =>
          Promise.resolve(node.toPrimitives().owner),
        ),
      ),
    ).resolves.toBe(owner);
  });

  it('should give an unowned node one owner when two identities claim it together', async () => {
    const claimants = [
      IdentityIdMother.canonical().valueOf(),
      IdentityIdMother.canonical().valueOf(),
    ];

    const results = await Promise.allSettled(
      claimants.map((claimant) =>
        new NodeOwnerAssigner(
          freshRepository(),
          mock<NodeBlockPolicy>(),
        ).assignOwner(new NodeOwnerAssignerMessage(claimant, claimant)),
      ),
    );
    const owner = (await freshRepository().loadLocalNode()).toPrimitives()
      .owner as string;
    const refusals = results.flatMap((result): unknown[] =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );

    expect(claimants).toContain(owner);
    expect(results[claimants.indexOf(owner)].status).toBe('fulfilled');
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toBeInstanceOf(
      NodeOwnerCanOnlyBeChangedByCurrentOwnerError,
    );
  });

  it('should keep one generated node when first loads race', async () => {
    await database.delete('node_metadata', 'local');

    const ids = await Promise.all(
      Array.from({ length: 5 }, async () =>
        (await freshRepository().loadLocalNodeId()).valueOf(),
      ),
    );

    expect(new Set(ids).size).toBe(1);
    expect((await freshRepository().loadLocalNodeId()).valueOf()).toBe(ids[0]);
  });
});
