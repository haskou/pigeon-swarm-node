import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import { LocalNodeNotFoundError } from '@app/contexts/nodes/domain/errors/LocalNodeNotFoundError';
import { NodeIsAlreadyOwnedByThisIdentityError } from '@app/contexts/nodes/domain/errors/NodeIsAlreadyOwnedByThisIdentityError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import LocalNodeBlockListRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockListRepository';
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
    resetter = new NodeOwnerSettingsResetter(
      nodeRepository,
      registrationCodeRepository,
      blockListRepository,
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

  it('should install the new owner and clear the registration mode and codes and the own block list', async () => {
    const cleared = await resetter.reset(newOwner);

    expect(cleared.map((setting) => setting.valueOf())).toEqual([
      'previous node owner',
      'registration mode codes (now open)',
      '2 registration codes',
      'own block list version 4 (1 identity, 0 nodes)',
    ]);
    expect((await storedMetadata())?.owner).toBe(newOwner.valueOf());
    await expect(
      nodeRepository.loadLocalNodeRegistrationMode(),
    ).resolves.toEqual(NodeRegistrationMode.OPEN);
    await expect(registrationCodeRepository.findAll()).resolves.toEqual([]);
    await expect(blockListRepository.findLocal()).resolves.toBeInstanceOf(
      NoNodeBlocks,
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

    await expect(resetter.reset(new IdentityId(owner.valueOf()))).rejects.toThrow(
      NodeIsAlreadyOwnedByThisIdentityError,
    );

    await expect(storedMetadata()).resolves.toEqual(before);
    await expect(registrationCodeRepository.findAll()).resolves.toHaveLength(2);
    await expect(blockListRepository.findLocal()).resolves.not.toBeInstanceOf(
      NoNodeBlocks,
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
