import { mock, MockProxy } from 'jest-mock-extended';

import IpfsKeychainRepository from '../../../../../../src/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import IpfsKeychainMapper from '../../../../../../src/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import MongoKeychainMetadataRepository from '../../../../../../src/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import { KeychainExternalIdentifier } from '../../../../../../src/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBReplicatedStateRegistry } from '../../../../../../src/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('IpfsKeychainRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsKeychainMapper;
  let metadataRepository: MockProxy<MongoKeychainMetadataRepository>;
  let repository: IpfsKeychainRepository;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsKeychainMapper();
    metadataRepository = mock<MongoKeychainMetadataRepository>();
    repository = new IpfsKeychainRepository(
      ipfsManager,
      mapper,
      metadataRepository,
    );
    ipfsManager.getRecordCandidates.mockResolvedValue([]);
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  afterEach(() => {
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  it('should use cached keychain metadata without reading IPFS', async () => {
    const keychain = (await KeychainMother.create()).build();
    const primitives = keychain.toPrimitives();
    const cidString = 'bafycachedkeychain';

    metadataRepository.findByOwnerIdentityId.mockResolvedValue([
      {
        _id: primitives.ownerIdentityId + ':' + cidString,
        cid: cidString,
        keychain: mapper.toDocument(keychain),
        ownerIdentityId: primitives.ownerIdentityId,
        previousCid: primitives.previousKeychainExternalIdentifier,
        receivedAt: Date.now(),
        version: primitives.version,
      },
    ]);

    const result = await repository.findCandidateReferencesByOwnerId(
      new IdentityId(primitives.ownerIdentityId),
    );

    expect(ipfsManager.getJSON).not.toHaveBeenCalled();
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
        _id: primitives.ownerIdentityId + ':' + cid.valueOf(),
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
    OrbitDBReplicatedStateRegistry.shared().register('network-1', {
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
