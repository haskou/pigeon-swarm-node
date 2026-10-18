import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import { NodeBlockListStorerMessage } from '@app/contexts/nodes/application/store-block-list/messages/NodeBlockListStorerMessage';
import NodeBlockListStorer from '@app/contexts/nodes/application/store-block-list/NodeBlockListStorer';
import { NodeBlockListMustBeSignedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeBlockListMustBeSignedByCurrentOwnerError';
import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import LocalNodeBlockListRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockListRepository';
import LocalNodeMetadataRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeMetadataRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { DomainError } from '@haskou/value-objects';
import { promises as fs } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';
import os from 'os';
import path from 'path';
import { setImmediate, setTimeout } from 'timers/promises';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
import { NodeBlockListMother } from '../../../mothers/NodeBlockListMother';

/**
 * A block list upload passes the route's owner check when it arrives, yet a
 * handover may land before the upload reaches the node section. Run against
 * the real local database, the upload must check the owner as it lands.
 */
describe('Concurrent node block list uploads and owner handovers', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let policy: MockProxy<NodeBlockPolicy>;
  let former: KeyPair;
  let formerId: string;
  let next: string;
  let firstList: NodeBlockListPrimitives;

  const freshRepository = (): LocalNodeMetadataRepository =>
    new LocalNodeMetadataRepository(
      new EmbeddedLocalDatabase(),
      networkRegistry,
      new LocalNodeMetadataMapper(),
    );

  const freshStorer = (): NodeBlockListStorer =>
    new NodeBlockListStorer(
      freshRepository(),
      new LocalNodeBlockListRepository(new EmbeddedLocalDatabase()),
      policy,
    );

  const handOver = async (): Promise<void> =>
    new NodeOwnerAssigner(freshRepository(), policy).assignOwner(
      new NodeOwnerAssignerMessage(next, formerId),
    );

  const storedList = async (): Promise<unknown> =>
    (
      await new LocalNodeBlockListRepository(
        new EmbeddedLocalDatabase(),
      ).findLocal()
    ).toPrimitives();

  /**
   * Holds the node section until the returned release is called, so the
   * calls started meanwhile queue on it in the order they were made.
   */
  const holdSection = async (): Promise<{
    release: () => void;
    done: Promise<void>;
  }> => {
    const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
    const { promise: released, resolve: release } =
      Promise.withResolvers<void>();
    const done = freshRepository().holdLocalNode(async () => {
      enter();
      await released;
    });

    await entered;

    return { done, release };
  };

  beforeAll(async () => {
    former = await KeyPair.generate();
    formerId = new NodeBlockListMother(former).ownerIdentityId().valueOf();
  });

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-node-block-list-handover-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    networkRegistry = mock<IPFSNetworkRegistry>();
    networkRegistry.getAll.mockReturnValue([]);
    policy = mock<NodeBlockPolicy>();
    next = IdentityIdMother.canonical().valueOf();

    await new NodeOwnerAssigner(freshRepository(), policy).assignOwner(
      new NodeOwnerAssignerMessage(formerId, formerId),
    );
    firstList = new NodeBlockListMother(former).withVersion(1).primitives();
    await freshStorer().store(new NodeBlockListStorerMessage(firstList));
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

  it('should refuse with a conflict an upload of the former owner when the handover lands first', async () => {
    const section = await holdSection();
    const handover = handOver();
    const upload = freshStorer().store(
      new NodeBlockListStorerMessage(
        new NodeBlockListMother(former)
          .withVersion(2)
          .blockingIdentities([IdentityIdMother.canonical()])
          .primitives(),
      ),
    );
    await setTimeout(50);
    section.release();

    // Domain errors answer 409 (`handleDomainError`).
    await expect(upload).rejects.toBeInstanceOf(
      NodeBlockListMustBeSignedByCurrentOwnerError,
    );
    await expect(upload).rejects.toBeInstanceOf(DomainError);
    await section.done;
    await handover;
    expect(await storedList()).toEqual(firstList);
    expect((await freshRepository().loadLocalNode()).toPrimitives().owner).toBe(
      next,
    );
  });

  it('should store an upload of the owner that lands before the handover', async () => {
    const list = new NodeBlockListMother(former).withVersion(2).primitives();
    const section = await holdSection();
    const upload = freshStorer().store(new NodeBlockListStorerMessage(list));
    const handover = handOver();
    await setTimeout(50);
    section.release();

    await section.done;
    await upload;
    await handover;
    expect(await storedList()).toEqual(list);
    expect((await freshRepository().loadLocalNode()).toPrimitives().owner).toBe(
      next,
    );
  });
});
