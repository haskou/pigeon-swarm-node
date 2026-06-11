import { mock, MockProxy } from 'jest-mock-extended';

import IpfsKeychainRepository from '../../../../../../src/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import IpfsKeychainMapper from '../../../../../../src/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import KeychainMetadataRepository from '../../../../../../src/contexts/keychains/domain/repositories/KeychainMetadataRepository';
import { KeychainExternalIdentifier } from '../../../../../../src/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('IpfsKeychainRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsKeychainMapper;
  let metadataRepository: MockProxy<KeychainMetadataRepository>;
  let repository: IpfsKeychainRepository;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsKeychainMapper();
    metadataRepository = mock<KeychainMetadataRepository>();
    repository = new IpfsKeychainRepository(
      ipfsManager,
      mapper,
      metadataRepository,
    );
    ipfsManager.getRecordCandidates.mockResolvedValue([]);
    ipfsManager.stat.mockResolvedValue(true);
    ipfsManager.hasConnectedPeers.mockResolvedValue(true);
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

  it('should not rewrite metadata after reading a metadata keychain from IPFS', async () => {
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
    expect(metadataRepository.save).not.toHaveBeenCalled();
  });

  it('should cache metadata after reading a remote keychain from IPFS', async () => {
    const keychain = (await KeychainMother.create()).build();
    const primitives = keychain.toPrimitives();
    const cid = new IPFSId('bafyremotekeychain');

    metadataRepository.findByOwnerIdentityId.mockResolvedValue([]);
    ipfsManager.getRecordCandidates.mockResolvedValue([cid.valueOf()]);
    ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(keychain));

    await repository.findCandidateReferencesByOwnerId(
      new IdentityId(primitives.ownerIdentityId),
    );

    expect(ipfsManager.getJSON).toHaveBeenCalledWith(cid);
    expect(metadataRepository.save).toHaveBeenCalledWith(keychain, cid);
  });

  it('should skip remote IPFS lookups when metadata is not local and no peers are connected', async () => {
    const keychain = (await KeychainMother.create()).build();
    const primitives = keychain.toPrimitives();

    metadataRepository.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafyremotekeychain',
        ownerIdentityId: primitives.ownerIdentityId,
        previousCid: primitives.previousKeychainExternalIdentifier,
        receivedAt: Date.now(),
        version: primitives.version,
      },
    ]);
    ipfsManager.stat.mockResolvedValue(false);
    ipfsManager.hasConnectedPeers.mockResolvedValue(false);

    const result = await repository.findCandidateReferencesByOwnerId(
      new IdentityId(primitives.ownerIdentityId),
    );

    expect(result).toEqual([]);
    expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfsManager.getJSON).not.toHaveBeenCalled();
  });
});
