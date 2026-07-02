import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import IpfsKeychainRepository from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import IpfsKeychainMapper from '@app/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import KeychainMetadataIndex from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataIndex';
import { KeychainMetadataRecord } from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataRecord';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { mock, MockProxy } from 'jest-mock-extended';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('IpfsKeychainRepository', () => {
  let ipfs: MockProxy<IPFS>;
  let metadataIndex: MockProxy<KeychainMetadataIndex>;
  let repository: IpfsKeychainRepository;

  beforeEach(() => {
    ipfs = mock<IPFS>();
    metadataIndex = mock<KeychainMetadataIndex>();
    repository = new IpfsKeychainRepository(
      ipfs,
      new IpfsKeychainMapper(),
      metadataIndex,
    );
    ipfs.hasConnectedPeers.mockResolvedValue(false);
    ipfs.getRecordCandidates.mockResolvedValue([]);
    ipfs.findConnectedNetworkIds.mockImplementation(
      async (networkIds) => networkIds,
    );
  });

  it('should use replicated keychain metadata when the IPFS block is not available', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(4).build();
    const metadata: KeychainMetadataRecord = {
      cid: 'bafy-keychain',
      keychain,
      ownerIdentityId: mother.ownerIdentityId.valueOf(),
      previousCid: undefined,
      receivedAt: 100,
      version: 4,
    };

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([metadata]);
    ipfs.getJSON.mockRejectedValue(new Error('not available'));
    ipfs.getBytes.mockRejectedValue(new Error('not available'));

    const candidates = await repository.findCandidateReferencesByOwnerId(
      mother.ownerIdentityId,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].getExternalIdentifier().valueOf()).toBe(
      'bafy-keychain',
    );
    expect(candidates[0].getKeychain().toPrimitives()).toEqual(
      keychain.toPrimitives(),
    );
    expect(ipfs.hasConnectedPeers).toHaveBeenCalled();
  });

  it('should try every local metadata candidate before falling back to remote lookup', async () => {
    const mother = await KeychainMother.create();
    const unavailable = mother.withVersion(5).build();
    const available = mother.withVersion(4).build();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafy-unavailable-keychain',
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 200,
        version: 5,
      },
      {
        cid: 'bafy-available-keychain',
        keychain: available,
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid:
          unavailable.toPrimitives().previousKeychainExternalIdentifier,
        receivedAt: 100,
        version: 4,
      },
    ]);
    ipfs.getJSON.mockRejectedValue(new Error('not available'));
    ipfs.getBytes.mockRejectedValue(new Error('not available'));

    const candidates = await repository.findCandidateReferencesByOwnerId(
      mother.ownerIdentityId,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].getExternalIdentifier().valueOf()).toBe(
      'bafy-available-keychain',
    );
    expect(candidates[0].getKeychain().toPrimitives()).toEqual(
      available.toPrimitives(),
    );
    expect(ipfs.hasConnectedPeers).toHaveBeenCalled();
  });

  it('should return local metadata without waiting for remote refresh', async () => {
    const mother = await KeychainMother.create();
    const local = mother.withVersion(1).build();
    const remote = mother
      .withVersion(2)
      .withPreviousKeychainExternalIdentifier('bafy-keychain-v1')
      .build();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafy-keychain-v1',
        keychain: local,
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    ipfs.hasConnectedPeers.mockResolvedValue(true);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-keychain-v2']);
    ipfs.getJSON.mockImplementation(<T>(cid: IPFSId): Promise<T> => {
      if (cid.valueOf() === 'bafy-keychain-v2') {
        return Promise.resolve(mapper.toDocument(remote) as T);
      }

      return Promise.resolve(mapper.toDocument(local) as T);
    });

    const candidates = await repository.findCandidateReferencesByOwnerId(
      mother.ownerIdentityId,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].getExternalIdentifier().valueOf()).toBe(
      'bafy-keychain-v1',
    );
    expect(candidates[0].getKeychain().toPrimitives()).toEqual(
      local.toPrimitives(),
    );
    await flushBackgroundTasks();
    expect(ipfs.getRecordCandidates).toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${mother.ownerIdentityId.valueOf()}`,
    );
  });

  it('should find previous keychains by replicated external identifier without IPFS', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(3).build();

    metadataIndex.findByExternalIdentifier.mockResolvedValue({
      cid: 'bafy-keychain-v3',
      keychain,
      ownerIdentityId: mother.ownerIdentityId.valueOf(),
      previousCid: 'bafy-keychain-v2',
      receivedAt: 100,
      version: 3,
    });

    const result = await repository.findByExternalIdentifier(
      new KeychainExternalIdentifier('bafy-keychain-v3'),
    );

    expect(result?.toPrimitives()).toEqual(keychain.toPrimitives());
    expect(ipfs.getJSON).not.toHaveBeenCalled();
    expect(ipfs.getBytes).not.toHaveBeenCalled();
  });

  it('should republish only the latest keychain routing record per owner', async () => {
    const mother = await KeychainMother.create();
    const latest = mother.withVersion(2).build();
    const older = mother.withVersion(1).build();

    metadataIndex.findAll.mockResolvedValue([
      {
        cid: 'bafy-latest',
        keychain: latest,
        networkIds: ['network-1'],
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: 'bafy-older',
        receivedAt: 200,
        version: 2,
      },
      {
        cid: 'bafy-older',
        keychain: older,
        networkIds: ['network-1'],
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 100,
        version: 1,
      },
    ]);
    ipfs.putRecordToNetworks.mockResolvedValue(undefined);

    const republished = await repository.republishLocalRoutingRecords();

    expect(republished).toBe(1);
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfs.getJSON).not.toHaveBeenCalled();
    expect(ipfs.getBytes).not.toHaveBeenCalled();
    expect(ipfs.addJSONToNetworks).not.toHaveBeenCalled();
    expect(ipfs.putRecordToNetworks).toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${mother.ownerIdentityId.valueOf()}`,
      'bafy-latest',
      ['network-1'],
    );
  });

  it('should skip keychain routing metadata without known networks', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(2).build();

    metadataIndex.findAll.mockResolvedValue([
      {
        cid: 'bafy-latest',
        keychain,
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 200,
        version: 2,
      },
    ]);

    const republished = await repository.republishLocalRoutingRecords();

    expect(republished).toBe(0);
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfs.getJSON).not.toHaveBeenCalled();
    expect(ipfs.getBytes).not.toHaveBeenCalled();
    expect(ipfs.addJSONToNetworks).not.toHaveBeenCalled();
    expect(ipfs.putRecordToNetworks).not.toHaveBeenCalled();
  });

  it('should skip keychain routing metadata when known networks have no connected peers', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(2).build();

    metadataIndex.findAll.mockResolvedValue([
      {
        cid: 'bafy-latest',
        keychain,
        networkIds: ['network-1'],
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 200,
        version: 2,
      },
    ]);
    ipfs.findConnectedNetworkIds.mockResolvedValue([]);

    const republished = await repository.republishLocalRoutingRecords();

    expect(republished).toBe(0);
    expect(ipfs.findConnectedNetworkIds).toHaveBeenCalledWith(['network-1']);
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfs.getJSON).not.toHaveBeenCalled();
    expect(ipfs.getBytes).not.toHaveBeenCalled();
    expect(ipfs.addJSONToNetworks).not.toHaveBeenCalled();
    expect(ipfs.putRecordToNetworks).not.toHaveBeenCalled();
  });
});

async function flushBackgroundTasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
