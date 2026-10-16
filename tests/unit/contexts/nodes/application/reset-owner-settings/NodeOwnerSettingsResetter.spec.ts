import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import { LocalNodeNotFoundError } from '@app/contexts/nodes/domain/errors/LocalNodeNotFoundError';
import { NodeIsAlreadyOwnedByThisIdentityError } from '@app/contexts/nodes/domain/errors/NodeIsAlreadyOwnedByThisIdentityError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockPublication } from '@app/contexts/nodes/domain/NodeBlockPublication';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import { NodeBlockListVersion } from '@app/contexts/nodes/domain/value-objects/NodeBlockListVersion';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import LocalNodeBlockExceptionsRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockExceptionsRepository';
import LocalNodeBlockListRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockListRepository';
import LocalNodeBlockPublicationRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockPublicationRepository';
import LocalNodeBlockSourceRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockSourceRepository';
import LocalNodeMetadataRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeMetadataRepository';
import LocalNodeRegistrationCodeRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeRegistrationCodeRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Integer, Timestamp } from '@haskou/value-objects';
import { promises as fs } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';
import os from 'os';
import path from 'path';
import { setImmediate } from 'timers/promises';

import { NetworkMother } from '../../../../mothers/NetworkMother';
import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

/**
 * Runs the owner reset against the real local database, the way
 * `yarn node:reset-owner` does on a stopped node.
 */
describe('NodeOwnerSettingsResetter', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  const relayConfiguration = NodeRelayConfiguration.fromPrimitives({
    callsRelay: { port: 4199 },
  });
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let nodeRepository: LocalNodeMetadataRepository;
  let registrationCodeRepository: LocalNodeRegistrationCodeRepository;
  let blockListRepository: LocalNodeBlockListRepository;
  let publicationRepository: LocalNodeBlockPublicationRepository;
  let sourceRepository: LocalNodeBlockSourceRepository;
  let exceptionsRepository: LocalNodeBlockExceptionsRepository;
  let publisher: IdentityId;
  let resetter: NodeOwnerSettingsResetter;
  let ownerKeyPair: KeyPair;
  let owner: IdentityId;
  let newOwner: IdentityId;
  let claimedNode: Node;

  const issueCode = (): NodeRegistrationCode => {
    const now = Timestamp.now();

    return NodeRegistrationCode.issue(
      NodeRegistrationCodeSecret.generate(),
      new Integer(3),
      now.addDays(1),
      new NodeRegistrationCodeLimits(100, 30),
      now,
    );
  };

  const storedMetadata = async (): Promise<
    Record<string, unknown> | undefined
  > => database.findOne('node_metadata', 'local');

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-node-owner-reset-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    networkRegistry = mock<IPFSNetworkRegistry>();
    networkRegistry.getAll.mockReturnValue([]);
    nodeRepository = new LocalNodeMetadataRepository(
      database,
      networkRegistry,
      new LocalNodeMetadataMapper(),
    );
    registrationCodeRepository = new LocalNodeRegistrationCodeRepository(
      database,
    );
    blockListRepository = new LocalNodeBlockListRepository(database);
    publicationRepository = new LocalNodeBlockPublicationRepository(database);
    sourceRepository = new LocalNodeBlockSourceRepository(database);
    exceptionsRepository = new LocalNodeBlockExceptionsRepository(database);
    resetter = new NodeOwnerSettingsResetter(
      nodeRepository,
      registrationCodeRepository,
      blockListRepository,
      publicationRepository,
      sourceRepository,
      exceptionsRepository,
    );

    ownerKeyPair = await KeyPair.generate();
    owner = new IdentityId(ownerKeyPair.toPrimitives().publicKey);
    newOwner = await NodeBlockListMother.identityId();
    const network = new NetworkMother().withPrivateKey();

    claimedNode = await nodeRepository.loadLocalNode();
    claimedNode.addNetwork(network.build());
    claimedNode.assignOwner(owner, owner);
    claimedNode.changeRegistrationMode(NodeRegistrationMode.CODES);
    claimedNode.updateRelayConfiguration(relayConfiguration);
    await nodeRepository.saveLocalNode(claimedNode);
    await registrationCodeRepository.save(issueCode());
    await registrationCodeRepository.save(issueCode());
    await blockListRepository.saveLocal(
      new NodeBlockListMother(ownerKeyPair)
        .withVersion(4)
        .blockingIdentities([await NodeBlockListMother.identityId()])
        .build(),
    );
    await publicationRepository.save(new NodeBlockPublication(true));

    const publisherKeyPair = await KeyPair.generate();
    const listed = await NodeBlockListMother.identityId();
    const source = NodeBlockSource.adopt(
      new IdentityId(publisherKeyPair.toPrimitives().publicKey),
      new NodeBlockSourceOrigin('https://publisher.example'),
      false,
    );

    publisher = source.getOwnerIdentityId();
    source.receive(
      new NodeBlockListMother(publisherKeyPair)
        .withVersion(2)
        .blockingIdentities([listed, await NodeBlockListMother.identityId()])
        .build(),
      new Timestamp(1),
    );
    source.approve(
      new NodeBlockListVersion(2),
      new NodeBlockEntries([listed], []),
    );
    await sourceRepository.save(source);
    await exceptionsRepository.save(
      new NodeBlockEntries([await NodeBlockListMother.identityId()], []),
    );
    await database.save('identities', 'someone', { name: 'kept' });
    await setImmediate();
    networkRegistry.initialize.mockClear();
    networkRegistry.register.mockClear();
    networkRegistry.removeNetwork.mockClear();
  });

  afterEach(async () => {
    await database.close();

    if (previousPath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousPath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('should install the new owner and clear the registration mode and codes, the own block list, publication, adopted sources and exceptions', async () => {
    const cleared = await resetter.reset(newOwner);

    expect(cleared.map((setting) => setting.valueOf())).toEqual([
      'previous node owner',
      'registration mode codes (now open)',
      '2 registration codes',
      'own block list version 4 (1 identity, 0 nodes)',
      'block list publication (now off)',
      `block source ${publisher.valueOf()} at https://publisher.example (1 applied, 1 pending)`,
      'block exceptions (1 identity, 0 nodes)',
    ]);
    expect((await storedMetadata())?.owner).toBe(newOwner.valueOf());
    await expect(
      nodeRepository.loadLocalNodeRegistrationMode(),
    ).resolves.toEqual(NodeRegistrationMode.OPEN);
    await expect(registrationCodeRepository.findAll()).resolves.toEqual([]);
    await expect(blockListRepository.findLocal()).resolves.toBeInstanceOf(
      NoNodeBlocks,
    );
    await expect(publicationRepository.find()).resolves.toEqual(
      NodeBlockPublication.unpublished(),
    );
    await expect(sourceRepository.findAll()).resolves.toEqual([]);
    await expect(exceptionsRepository.find()).resolves.toEqual(
      NodeBlockEntries.none(),
    );
  });

  it('should keep the node id, networks, relay configuration and other local data', async () => {
    const before = claimedNode.toPrimitives();

    await resetter.reset(newOwner);

    const stored = await storedMetadata();

    expect(stored?.nodeId).toBe(before.id);
    expect(stored?.networks).toEqual(before.networks);
    expect(stored?.relayConfiguration).toEqual(
      relayConfiguration.toPrimitives(),
    );
    await expect(database.findOne('identities', 'someone')).resolves.toEqual({
      _id: 'someone',
      name: 'kept',
    });
  });

  it('should not start or change the runtime networks', async () => {
    await resetter.reset(newOwner);

    expect(networkRegistry.initialize).not.toHaveBeenCalled();
    expect(networkRegistry.register).not.toHaveBeenCalled();
    expect(networkRegistry.removeNetwork).not.toHaveBeenCalled();
  });

  it('should refuse the identity that already owns the node and change nothing', async () => {
    const before = await storedMetadata();

    await expect(
      resetter.reset(new IdentityId(owner.valueOf())),
    ).rejects.toThrow(NodeIsAlreadyOwnedByThisIdentityError);

    await expect(storedMetadata()).resolves.toEqual(before);
    await expect(registrationCodeRepository.findAll()).resolves.toHaveLength(2);
    await expect(blockListRepository.findLocal()).resolves.not.toBeInstanceOf(
      NoNodeBlocks,
    );
    await expect(publicationRepository.find()).resolves.toEqual(
      new NodeBlockPublication(true),
    );
    await expect(sourceRepository.findAll()).resolves.toHaveLength(1);
    await expect(exceptionsRepository.find()).resolves.not.toEqual(
      NodeBlockEntries.none(),
    );
  });

  it('should refuse a database no node has run on, and create no node there', async () => {
    await database.delete('node_metadata', 'local');

    await expect(resetter.reset(newOwner)).rejects.toThrow(
      LocalNodeNotFoundError,
    );

    await expect(storedMetadata()).resolves.toBeUndefined();
    await expect(registrationCodeRepository.findAll()).resolves.toHaveLength(2);
  });

  it('should keep the previous owner when clearing a setting fails, so the operator can run it again', async () => {
    jest
      .spyOn(blockListRepository, 'resetOwnerSettings')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(resetter.reset(newOwner)).rejects.toThrow('disk full');
    expect((await storedMetadata())?.owner).toBe(owner.valueOf());

    const cleared = await resetter.reset(newOwner);

    expect(cleared.map((setting) => setting.valueOf())).toContain(
      'previous node owner',
    );
    expect((await storedMetadata())?.owner).toBe(newOwner.valueOf());
  });

  it('should never leave the node without an owner another identity could claim', async () => {
    const other = await NodeBlockListMother.identityId();

    await resetter.reset(newOwner);

    const node = await nodeRepository.loadLocalNode();

    expect(() => node.assignOwner(other, other)).toThrow(
      NodeOwnerCanOnlyBeChangedByCurrentOwnerError,
    );
    expect(node.isOwnedBy(newOwner)).toBe(true);
  });
});
