import { mock, MockProxy } from 'jest-mock-extended';

import IpfsKeychainRepository from '../../../../../../src/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import IpfsKeychainMapper from '../../../../../../src/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import KeychainMetadataRepository from '../../../../../../src/contexts/keychains/domain/repositories/KeychainMetadataRepository';
import { KeychainExternalIdentifier } from '../../../../../../src/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '../../../../../../src/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('IpfsKeychainRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsKeychainMapper;
  let metadataRepository: MockProxy<KeychainMetadataRepository>;
  let replicatedStateRegistry: OrbitDBReplicatedStateRegistry;
  let repository: IpfsKeychainRepository;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsKeychainMapper();
    metadataRepository = mock<KeychainMetadataRepository>();
    replicatedStateRegistry = new OrbitDBReplicatedStateRegistry();
    repository = new IpfsKeychainRepository(
      ipfsManager,
      mapper,
      metadataRepository,
      replicatedStateRegistry,
    );
    ipfsManager.getRecordCandidates.mockResolvedValue([]);
    replicatedStateRegistry.clear();
  });

  afterEach(() => {
    replicatedStateRegistry.clear();
  });

  it('should use local keychain metadata before DHT fallback', async () => {
    const keychain = (await KeychainMother.create()).build();
    const primitives = keychain.toPrimitives();
    const cidString = 'bafycachedkeychain';

    metadataRepository.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: cidString,
        ownerIdentityId: primitives.ownerIdentityId,
        previousCid: primitives.previousKeychainExternalIdentifier,
        receivedAt: Date.now(),
        version: primitives.version,
      },
    ]);
    ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(keychain));

    const result = await repository.findCandidateReferencesByOwnerId(
      new IdentityId(primitives.ownerIdentityId),
    );

    expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
    expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        externalIdentifier: new KeychainExternalIdentifier(cidString),
        keychain,
        source: 'local',
      },
    ]);
  });

  it('should warm old metadata after reading the keychain from IPFS', async () => {
    const keychain = (await KeychainMother.create()).build();
    const primitives = keychain.toPrimitives();
    const cid = new IPFSId('bafyoldkeychain');

    metadataRepository.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: cid.valueOf(),
        ownerIdentityId: primitives.ownerIdentityId,
        previousCid: primitives.previousKeychainExternalIdentifier,
        receivedAt: Date.now(),
        version: primitives.version,
      },
    ]);
    ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(keychain));

    await repository.findCandidateReferencesByOwnerId(
      new IdentityId(primitives.ownerIdentityId),
    );

    expect(ipfsManager.getJSON).toHaveBeenCalledWith(cid);
    expect(metadataRepository.save).toHaveBeenCalledWith(keychain, cid);
  });

  it('should find keychain using replicated OrbitDB metadata before DHT fallback', async () => {
    const keychain = (await KeychainMother.create()).build();
    const primitives = keychain.toPrimitives();
    const cid = new IPFSId('bafyorbitkeychain');

    metadataRepository.findByOwnerIdentityId.mockResolvedValue([]);
    replicatedStateRegistry.register('network-1', {
      keychains: {
        query: jest.fn().mockResolvedValue([
          {
            cid: cid.valueOf(),
            id: primitives.ownerIdentityId,
            receivedAt: Date.now(),
            version: primitives.version,
          },
        ]),
      },
    } as never);
    ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(keychain));

    const result = await repository.findCandidateReferencesByOwnerId(
      new IdentityId(primitives.ownerIdentityId),
    );

    expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfsManager.getJSON).toHaveBeenCalledWith(cid);
    expect(result).toEqual([
      {
        externalIdentifier: new KeychainExternalIdentifier(cid.valueOf()),
        keychain,
        source: 'local',
      },
    ]);
  });
});
