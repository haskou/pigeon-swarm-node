import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import IpfsKeychainRepository from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import IpfsKeychainMapper from '@app/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import KeychainMetadataIndex from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataIndex';
import { KeychainMetadataRecord } from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataRecord';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { IPFSContentTooLargeError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentTooLargeError';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import Kernel from '@haskou/ddd-kernel';
import { DomainError } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { KeychainMother } from '../../../../mothers/KeychainMother';

const ROUTED_DOCUMENT_BYTES = 256 * 1024;
const PUBLISH_BODY_BYTES = 100 * 1024;

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
    ipfs.getRecordCandidates.mockResolvedValue([]);
    ipfs.findConnectedNetworkIds.mockImplementation((networkIds) =>
      Promise.resolve(networkIds),
    );
  });

  // Mirrors the IPFS fetch caps: content larger than the cap is refused.
  const serveRoutedDocument = (document: unknown): void => {
    const bytes = Buffer.from(JSON.stringify(document));
    const fits = (maxBytes?: number): boolean =>
      maxBytes === undefined || bytes.length <= maxBytes;

    ipfs.getJSON.mockImplementation((cid, maxBytes) =>
      fits(maxBytes)
        ? Promise.resolve(document)
        : Promise.reject(
            new IPFSContentTooLargeError(cid.valueOf(), maxBytes ?? 0),
          ),
    );
    ipfs.getBytes.mockImplementation((cid, maxBytes) =>
      fits(maxBytes)
        ? Promise.resolve(bytes)
        : Promise.reject(
            new IPFSContentTooLargeError(cid.valueOf(), maxBytes ?? 0),
          ),
    );
  };

  it('should use complete replicated keychain metadata without reading IPFS', async () => {
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
    expect(ipfs.getJSON).not.toHaveBeenCalled();
    expect(ipfs.getBytes).not.toHaveBeenCalled();
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
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
    expect(ipfs.getJSON).toHaveBeenCalledTimes(1);
    expect(ipfs.getBytes).toHaveBeenCalledTimes(1);
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
  });

  it('should not refresh routing records when local metadata is available', async () => {
    const mother = await KeychainMother.create();
    const local = mother.withVersion(1).build();

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
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfs.getJSON).not.toHaveBeenCalled();
    expect(ipfs.getBytes).not.toHaveBeenCalled();
  });

  it('should discover a remote keychain when local metadata is unavailable', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-keychain-v2']);
    ipfs.getJSON.mockResolvedValue(mapper.toDocument(remote));

    const candidates = await repository.findCandidateReferencesByOwnerId(
      mother.ownerIdentityId,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].getExternalIdentifier().valueOf()).toBe(
      'bafy-keychain-v2',
    );
    expect(candidates[0].getKeychain().toPrimitives()).toEqual(
      remote.toPrimitives(),
    );
    expect(ipfs.getRecordCandidates).toHaveBeenCalledTimes(1);
    expect(ipfs.getRecordCandidates).toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${mother.ownerIdentityId.valueOf()}`,
    );
    expect(ipfs.getJSON).toHaveBeenCalledTimes(1);
  });

  it('should report an owner keychain held in local metadata without reading IPFS', async () => {
    const mother = await KeychainMother.create();
    const keychain = mother.withVersion(1).build();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafy-keychain-v1',
        keychain,
        ownerIdentityId: mother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 100,
        version: 1,
      },
    ]);

    await expect(
      repository.hasKeychainForOwner(mother.ownerIdentityId),
    ).resolves.toBe(true);
    expect(ipfs.getRecordCandidates).not.toHaveBeenCalled();
    expect(ipfs.getJSON).not.toHaveBeenCalled();
  });

  it('should not report an owner-indexed metadata row whose keychain belongs to another owner', async () => {
    const owner = await KeychainMother.create();
    const other = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafy-other-keychain-v1',
        keychain: other.withVersion(1).build(),
        ownerIdentityId: owner.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 100,
        version: 1,
      },
    ]);

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
    expect(ipfs.getRecordCandidates).toHaveBeenCalledTimes(1);
  });

  it('should report an owner keychain discovered remotely', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-keychain-v2']);
    ipfs.getJSON.mockResolvedValue(mapper.toDocument(remote));

    await expect(
      repository.hasKeychainForOwner(mother.ownerIdentityId),
    ).resolves.toBe(true);
  });

  it('should ignore remote keychains that belong to another owner', async () => {
    const owner = await KeychainMother.create();
    const other = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-other-keychain']);
    ipfs.getJSON.mockResolvedValue(
      mapper.toDocument(other.withVersion(1).build()),
    );

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
  });

  it('should not report another owner keychain held in local metadata', async () => {
    const owner = await KeychainMother.create();
    const other = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafy-other-keychain',
        keychain: other.withVersion(1).build(),
        ownerIdentityId: other.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 100,
        version: 1,
      },
    ]);

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
  });

  it('should fail closed when a routed keychain document cannot be fetched', async () => {
    const owner = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-unreadable-keychain']);
    ipfs.getJSON.mockRejectedValue(new Error('document not found'));
    ipfs.getBytes.mockRejectedValue(new Error('document not found'));

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
  });

  it('should fail closed when an unreadable routed candidate sits beside another owner keychain', async () => {
    const owner = await KeychainMother.create();
    const other = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue([
      'bafy-unreadable-candidate',
      'bafy-other-keychain',
    ]);
    ipfs.getJSON.mockImplementation((cid) =>
      cid.valueOf() === 'bafy-other-keychain'
        ? Promise.resolve(mapper.toDocument(other.withVersion(1).build()))
        : Promise.reject(new Error('document not found')),
    );
    ipfs.getBytes.mockRejectedValue(new Error('document not found'));

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
  });

  it('should report the owner keychain when a failed JSON fetch falls back to readable bytes', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-keychain-v2']);
    ipfs.getJSON.mockRejectedValue(new Error('timed out'));
    ipfs.getBytes.mockResolvedValue(
      Buffer.from(JSON.stringify(mapper.toDocument(remote))),
    );

    await expect(
      repository.hasKeychainForOwner(mother.ownerIdentityId),
    ).resolves.toBe(true);
  });

  it('should fail closed when the replicated index is not ready for a verified remote keychain', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-keychain-v2']);
    ipfs.getJSON.mockResolvedValue(mapper.toDocument(remote));
    metadataIndex.save.mockRejectedValue(new ReplicatedStateNotReadyError());

    await expect(
      repository.hasKeychainForOwner(mother.ownerIdentityId),
    ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
  });

  it('should still report the owner keychain when another routed candidate cannot be read', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue([
      'bafy-unreadable-candidate',
      'bafy-keychain-v2',
    ]);
    ipfs.getJSON.mockImplementation((cid) =>
      cid.valueOf() === 'bafy-keychain-v2'
        ? Promise.resolve(mapper.toDocument(remote))
        : Promise.reject(new Error('document not found')),
    );
    ipfs.getBytes.mockRejectedValue(new Error('document not found'));

    await expect(
      repository.hasKeychainForOwner(mother.ownerIdentityId),
    ).resolves.toBe(true);
  });

  it('should fail closed when mapping a routed document throws a non-domain error', async () => {
    const owner = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();
    const repositoryWithFailingMapper = new IpfsKeychainRepository(
      ipfs,
      mapper,
      metadataIndex,
    );

    jest.spyOn(mapper, 'toDomain').mockImplementation(() => {
      throw new TypeError('mapping failed');
    });
    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-mapping-fails']);
    ipfs.getJSON.mockResolvedValue(
      mapper.toDocument(owner.withVersion(1).build()),
    );

    await expect(
      repositoryWithFailingMapper.hasKeychainForOwner(owner.ownerIdentityId),
    ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
  });

  it('should skip a routed document whose mapping fails with a domain error', async () => {
    const owner = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();
    const repositoryWithFailingMapper = new IpfsKeychainRepository(
      ipfs,
      mapper,
      metadataIndex,
    );

    jest.spyOn(mapper, 'toDomain').mockImplementation(() => {
      throw new DomainError('keychain rejected');
    });
    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-mapping-fails']);
    ipfs.getJSON.mockResolvedValue(
      mapper.toDocument(owner.withVersion(1).build()),
    );

    await expect(
      repositoryWithFailingMapper.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
  });

  it('should fail closed when a routed document exceeds the fetch size cap', async () => {
    const owner = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();
    const oversized = {
      ...mapper.toDocument(owner.withVersion(1).build()),
      encryptedPayload: 'A'.repeat(ROUTED_DOCUMENT_BYTES),
    };

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-oversized-keychain']);
    serveRoutedDocument(oversized);

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
  });

  it('should verify a routed keychain as large as a publish body', async () => {
    const owner = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();
    const publishSized = {
      ...mapper.toDocument(owner.withVersion(1).build()),
      encryptedPayload: 'A'.repeat(PUBLISH_BODY_BYTES),
    };

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-publish-sized-keychain']);
    serveRoutedDocument(publishSized);

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(true);
  });

  it('should fail closed when routed candidates overflow the check cap without identifying the owner', async () => {
    const owner = await KeychainMother.create();
    const candidates = Array.from(
      { length: 25 },
      (_, index) => `bafy-unreadable-${index}`,
    );

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(candidates);
    ipfs.getJSON.mockRejectedValue(new Error('document not found'));
    ipfs.getBytes.mockRejectedValue(new Error('document not found'));

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
    expect(ipfs.getJSON).toHaveBeenCalledTimes(20);
  });

  it('should still report an owner keychain found within the check cap when routed candidates overflow', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();
    const candidates = Array.from(
      { length: 25 },
      (_, index) => `bafy-unreadable-${index}`,
    );
    candidates[3] = 'bafy-keychain-v2';

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(candidates);
    ipfs.getJSON.mockImplementation((cid) =>
      cid.valueOf() === 'bafy-keychain-v2'
        ? Promise.resolve(mapper.toDocument(remote))
        : Promise.reject(new Error('document not found')),
    );
    ipfs.getBytes.mockRejectedValue(new Error('document not found'));

    await expect(
      repository.hasKeychainForOwner(mother.ownerIdentityId),
    ).resolves.toBe(true);
  });

  it('should not fail closed when routed candidates exactly fill the check cap', async () => {
    const owner = await KeychainMother.create();
    const candidates = Array.from(
      { length: 20 },
      (_, index) => `bafy-not-a-keychain-${index}`,
    );

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(candidates);
    ipfs.getJSON.mockResolvedValue({ unrelated: true });

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
    expect(ipfs.getJSON).toHaveBeenCalledTimes(20);
  });

  describe('routed candidate overflow log', () => {
    let warn: jest.Mock;

    beforeEach(() => {
      warn = jest.fn();
      jest
        .spyOn(Kernel, 'logger', 'get')
        .mockReturnValue({ warn } as unknown as typeof Kernel.logger);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log overflow as a count only, at most once per interval', async () => {
      const owner = await KeychainMother.create();
      const candidates = Array.from(
        { length: 25 },
        (_, index) => `bafy-unreadable-${index}`,
      );

      metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
      ipfs.getRecordCandidates.mockResolvedValue(candidates);
      ipfs.getJSON.mockRejectedValue(new Error('document not found'));
      ipfs.getBytes.mockRejectedValue(new Error('document not found'));

      await expect(
        repository.hasKeychainForOwner(owner.ownerIdentityId),
      ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);
      await expect(
        repository.hasKeychainForOwner(owner.ownerIdentityId),
      ).rejects.toBeInstanceOf(KeychainOwnershipUnverifiedError);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('candidates=25'),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('bafy-unreadable');
    });
  });

  it('should fail closed without the index reason when local metadata cannot be read', async () => {
    const owner = await KeychainMother.create();
    const indexFailure = new Error('index unavailable');

    metadataIndex.findByOwnerIdentityId.mockRejectedValue(indexFailure);

    const error = await repository
      .hasKeychainForOwner(owner.ownerIdentityId)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(KeychainOwnershipUnverifiedError);
    expect((error as Error).message).not.toContain('index unavailable');
    expect((error as KeychainOwnershipUnverifiedError).cause).toBe(
      indexFailure,
    );
  });

  it('should fail closed without the write reason when a verified remote keychain cannot be indexed', async () => {
    const mother = await KeychainMother.create();
    const remote = mother.withVersion(2).build();
    const mapper = new IpfsKeychainMapper();
    const writeFailure = new Error('disk full');

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-keychain-v2']);
    ipfs.getJSON.mockResolvedValue(mapper.toDocument(remote));
    metadataIndex.save.mockRejectedValue(writeFailure);

    const error = await repository
      .hasKeychainForOwner(mother.ownerIdentityId)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(KeychainOwnershipUnverifiedError);
    expect((error as KeychainOwnershipUnverifiedError).cause).toBe(
      writeFailure,
    );
  });

  it('should fail closed without the routing reason when the routing lookup fails', async () => {
    const owner = await KeychainMother.create();
    const routing = new Error('routing unavailable');

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockRejectedValue(routing);

    const error = await repository
      .hasKeychainForOwner(owner.ownerIdentityId)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(KeychainOwnershipUnverifiedError);
    expect((error as Error).message).not.toContain('routing unavailable');
    expect((error as KeychainOwnershipUnverifiedError).cause).toBe(routing);
  });

  it('should not report an owner keychain from a keychain-less metadata row', async () => {
    const owner = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([
      {
        cid: 'bafy-keychain-v1',
        ownerIdentityId: owner.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 100,
        version: 1,
      },
    ]);

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
    expect(ipfs.getRecordCandidates).toHaveBeenCalledTimes(1);
  });

  it('should ignore a remote document that fails verification on write', async () => {
    const owner = await KeychainMother.create();
    const mapper = new IpfsKeychainMapper();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-forged-keychain']);
    ipfs.getJSON.mockResolvedValue(
      mapper.toDocument(owner.withVersion(1).build()),
    );
    metadataIndex.save.mockRejectedValue(new InvalidPublicMutationError());

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
  });

  it('should ignore routed bytes that are not JSON when checking for an owner keychain', async () => {
    const owner = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-garbage-document']);
    ipfs.getJSON.mockRejectedValue(new Error('not json'));
    ipfs.getBytes.mockResolvedValue(Buffer.from('not a keychain'));

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
  });

  it('should ignore routed documents with malformed fields when checking for an owner keychain', async () => {
    const owner = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue([
      'bafy-null-document',
      'bafy-partial-document',
    ]);
    ipfs.getJSON
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 42 } as never);

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
  });

  it('should ignore routed JSON that is not a keychain when checking for an owner keychain', async () => {
    const owner = await KeychainMother.create();

    metadataIndex.findByOwnerIdentityId.mockResolvedValue([]);
    ipfs.getRecordCandidates.mockResolvedValue(['bafy-non-keychain-json']);
    ipfs.getJSON.mockResolvedValue({ unrelated: true });

    await expect(
      repository.hasKeychainForOwner(owner.ownerIdentityId),
    ).resolves.toBe(false);
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

    const result = await repository.requireByExternalIdentifier(
      new KeychainExternalIdentifier('bafy-keychain-v3'),
    );

    expect(result.toPrimitives()).toEqual(keychain.toPrimitives());
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
    expect(ipfs.findConnectedNetworkIds).toHaveBeenCalledWith(['network-1']);
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
    expect(ipfs.findConnectedNetworkIds).not.toHaveBeenCalled();
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

  it('should resolve connected networks once per keychain republish pass', async () => {
    const connectedMother = await KeychainMother.create();
    const disconnectedMother = await KeychainMother.create();

    metadataIndex.findAll.mockResolvedValue([
      {
        cid: 'bafy-connected-keychain',
        keychain: connectedMother.withVersion(1).build(),
        networkIds: ['network-1'],
        ownerIdentityId: connectedMother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 2,
        version: 1,
      },
      {
        cid: 'bafy-disconnected-keychain',
        keychain: disconnectedMother.withVersion(1).build(),
        networkIds: ['network-2'],
        ownerIdentityId: disconnectedMother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    ipfs.findConnectedNetworkIds.mockResolvedValue(['network-1']);

    const republished = await repository.republishLocalRoutingRecords();

    expect(republished).toBe(1);
    expect(ipfs.findConnectedNetworkIds).toHaveBeenCalledTimes(1);
    expect(ipfs.findConnectedNetworkIds).toHaveBeenCalledWith([
      'network-1',
      'network-2',
    ]);
    expect(ipfs.putRecordToNetworks).toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${connectedMother.ownerIdentityId.valueOf()}`,
      'bafy-connected-keychain',
      ['network-1'],
    );
    expect(ipfs.putRecordToNetworks).not.toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${disconnectedMother.ownerIdentityId.valueOf()}`,
      'bafy-disconnected-keychain',
      expect.any(Array),
    );
  });

  it('should republish keychain routing records only for the requested network', async () => {
    const requestedMother = await KeychainMother.create();
    const otherMother = await KeychainMother.create();

    metadataIndex.findAll.mockResolvedValue([
      {
        cid: 'bafy-requested-keychain',
        keychain: requestedMother.withVersion(1).build(),
        networkIds: ['network-1'],
        ownerIdentityId: requestedMother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 2,
        version: 1,
      },
      {
        cid: 'bafy-other-keychain',
        keychain: otherMother.withVersion(1).build(),
        networkIds: ['network-2'],
        ownerIdentityId: otherMother.ownerIdentityId.valueOf(),
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    ipfs.findConnectedNetworkIds.mockResolvedValue(['network-1']);

    const republished =
      await repository.republishLocalRoutingRecords('network-1');

    expect(republished).toBe(1);
    expect(ipfs.findConnectedNetworkIds).toHaveBeenCalledWith(['network-1']);
    expect(ipfs.putRecordToNetworks).toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${requestedMother.ownerIdentityId.valueOf()}`,
      'bafy-requested-keychain',
      ['network-1'],
    );
    expect(ipfs.putRecordToNetworks).not.toHaveBeenCalledWith(
      `pigeon-swarm_keychain-${otherMother.ownerIdentityId.valueOf()}`,
      'bafy-other-keychain',
      expect.any(Array),
    );
  });
});
