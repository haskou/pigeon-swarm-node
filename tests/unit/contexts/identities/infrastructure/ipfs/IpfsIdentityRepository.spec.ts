import { KeyPair } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityNotFoundError } from '../../../../../../src/contexts/identities/domain/errors/IdentityNotFoundError';
import { Identity } from '../../../../../../src/contexts/identities/domain/Identity';
import { Profile } from '../../../../../../src/contexts/identities/domain/Profile';
import IdentityMetadataRepository from '../../../../../../src/contexts/identities/domain/repositories/IdentityMetadataRepository';
import { IdentityExternalIdentifier } from '../../../../../../src/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../../../../../src/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '../../../../../../src/contexts/identities/domain/value-objects/ProfileName';
import IpfsIdentityRepository from '../../../../../../src/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import IpfsIdentityMapper from '../../../../../../src/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IpfsIdentityRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsIdentityMapper;
  let metadataRepository: MockProxy<IdentityMetadataRepository>;
  let repository: IpfsIdentityRepository;
  let mother: IdentityMother;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsIdentityMapper();
    metadataRepository = mock<IdentityMetadataRepository>();
    repository = new IpfsIdentityRepository(
      ipfsManager,
      mapper,
      metadataRepository,
    );
    mother = new IdentityMother();
    ipfsManager.getRecordCandidates.mockResolvedValue([]);
    ipfsManager.stat.mockResolvedValue(true);
    ipfsManager.hasConnectedPeers.mockResolvedValue(false);
  });

  async function createSignedIdentityForNetwork(
    networkId: string,
    handle?: string,
  ): Promise<Identity> {
    const keyPair = await KeyPair.generate();
    const encryptedKeyPair = await keyPair.encryptKeyPair(
      'Super-secret-password1!',
    );
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const previousIdentityExternalIdentifier: string | undefined = undefined;
    const signaturePayload = {
      encryptedKeyPair: encryptedKeyPair.toPrimitives(),
      encryptedMasterKey: 'v1.test.encrypted-master-key',
      id: identityId.valueOf(),
      masterKeyDerivation: {
        passkeyPrf: {
          algorithm: 'webauthn-prf',
          credentialId: 'test-credential-id',
          salt: 'test-salt',
          version: 1,
        },
      },
      networks: [networkId],
      previousIdentityExternalIdentifier,
      profile: new Profile(
        new ProfileName('Mallory'),
        undefined,
        undefined,
        undefined,
        handle ? new ProfileHandle(handle) : undefined,
      ).toPrimitives(),
      timestamp: 1773848829055,
      version: 1,
    };

    return Identity.fromPrimitives({
      ...signaturePayload,
      signature: keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
    });
  }

  describe('save', () => {
    it('should save identity document to all networks and put record', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const expectedCid = new IPFSId('bafyresultcid');

      ipfsManager.addJSONToNetworks.mockResolvedValue(expectedCid);
      ipfsManager.putRecordToNetworks.mockResolvedValue(undefined);

      await repository.save(identity);

      expect(ipfsManager.addJSONToNetworks).toHaveBeenCalledWith(
        expect.objectContaining({
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        }),
        primitives.networks,
      );
      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
        expectedCid.valueOf(),
        primitives.networks,
      );
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        expectedCid,
      );
    });
  });

  describe('findById', () => {
    it('should find identity using metadata before DHT fallback', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: cidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findById(identityId);

      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        new IPFSId(cidString),
      );
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should use embedded metadata identity without fetching IPFS bytes', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: 'bafyembeddedidentity',
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);

      const result = await repository.findById(identityId);

      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should not wait for DHT candidates when metadata has a valid candidate without connected peers', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const mongoCidString = 'bafymongocid';
      const dhtCidString = 'bafydhtcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: mongoCidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getRecordCandidates.mockResolvedValue([dhtCidString]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findCandidatesById(identityId);

      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(mongoCidString),
      );
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).not.toHaveBeenCalledWith(
        new IPFSId(dhtCidString),
      );
      expect(result).toHaveLength(1);
    });

    it('should merge remote candidates when local metadata is stale and peers are connected', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafyidentity-v1';
      const currentCidString = 'bafyidentity-v2';
      const currentIdentity = await previousIdentity.updateProfile(
        new Profile(new ProfileName('Jane')),
        mother.password,
        new IdentityExternalIdentifier(previousCidString),
      );

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: previousCidString,
          identity: previousIdentity,
          identityId: previousPrimitives.id,
          previousCid: previousPrimitives.previousIdentityExternalIdentifier,
          receivedAt: 1,
          version: previousPrimitives.version,
        },
      ]);
      ipfsManager.hasConnectedPeers.mockResolvedValue(true);
      ipfsManager.getRecordCandidates.mockResolvedValue([currentCidString]);
      ipfsManager.getJSON.mockImplementation(<T>(cid: IPFSId): Promise<T> => {
        if (cid.valueOf() === currentCidString) {
          return Promise.resolve(mapper.toDocument(currentIdentity) as T);
        }

        return Promise.resolve(mapper.toDocument(previousIdentity) as T);
      });

      const result = await repository.findById(
        new IdentityId(previousPrimitives.id),
      );

      expect(ipfsManager.getRecordCandidates).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + previousPrimitives.id,
      );
      expect(result.toPrimitives()).toEqual(currentIdentity.toPrimitives());
    });

    it('should fallback to DHT and cache metadata when mongo has no candidates', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([cidString]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findById(identityId);

      expect(ipfsManager.getRecordCandidates).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
      );
      expect(metadataRepository.save.mock.calls[0][0].toPrimitives()).toEqual(
        primitives,
      );
      expect(metadataRepository.save.mock.calls[0][1]).toEqual(
        new IPFSId(cidString),
      );
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should resolve local record candidates when metadata is missing and no peers are connected', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafylocalrecordidentity';

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.hasConnectedPeers.mockResolvedValue(false);
      ipfsManager.getRecordCandidates.mockResolvedValue([cidString]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findById(identityId);

      expect(ipfsManager.getRecordCandidates).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
      );
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        new IPFSId(cidString),
      );
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should delete broken mongo metadata and fallback to DHT', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const brokenCidString = 'bafybrokencid';
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: brokenCidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSON
        .mockRejectedValueOnce(new Error('missing block'))
        .mockResolvedValueOnce(mapper.toDocument(identity));
      ipfsManager.hasConnectedPeers.mockResolvedValue(true);
      ipfsManager.getRecordCandidates.mockResolvedValue([cidString]);

      const result = await repository.findById(identityId);

      expect(
        metadataRepository.deleteByExternalIdentifier,
      ).toHaveBeenCalledWith(new IPFSId(brokenCidString));
      expect(ipfsManager.getRecordCandidates).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
      );
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should throw IdentityNotFoundError when no record exists', async () => {
      const identity = await mother.build();
      const identityId = new IdentityId(identity.toPrimitives().id);

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([]);

      await expect(repository.findById(identityId)).rejects.toThrow(
        IdentityNotFoundError,
      );
    });

    it('should reject DHT candidates for another identity before caching', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const wrongCidString = 'bafywrongidentity';
      const validCidString = 'bafyvalididentity';
      const otherIdentity = await createSignedIdentityForNetwork(
        primitives.networks[0],
      );

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([
        wrongCidString,
        validCidString,
      ]);
      ipfsManager.getJSON
        .mockResolvedValueOnce(mapper.toDocument(otherIdentity))
        .mockResolvedValueOnce(mapper.toDocument(identity));

      const result = await repository.findById(identityId);

      expect(
        metadataRepository.deleteByExternalIdentifier,
      ).toHaveBeenCalledWith(new IPFSId(wrongCidString));
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        new IPFSId(validCidString),
      );
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should reject tampered DHT candidates and return not found', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const tamperedCidString = 'bafytamperedidentity';

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([tamperedCidString]);
      ipfsManager.getJSON.mockResolvedValue({
        ...mapper.toDocument(identity),
        signature: 'tampered-signature',
      });

      await expect(repository.findById(identityId)).rejects.toThrow(
        IdentityNotFoundError,
      );
      expect(
        metadataRepository.deleteByExternalIdentifier,
      ).toHaveBeenCalledWith(new IPFSId(tamperedCidString));
      expect(metadataRepository.save).not.toHaveBeenCalled();
    });

    it('should accept a DHT candidate with a valid previous chain', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafypreviousidentity';
      const candidateCidString = 'bafyupdatedidentity';
      const candidate = await previousIdentity.updateProfile(
        new Profile(new ProfileName('Jane')),
        mother.password,
        new IdentityExternalIdentifier(previousCidString),
      );

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([candidateCidString]);
      ipfsManager.getJSON
        .mockResolvedValueOnce(mapper.toDocument(candidate))
        .mockResolvedValueOnce(mapper.toDocument(previousIdentity));

      const result = await repository.findById(
        new IdentityId(previousPrimitives.id),
      );

      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(previousCidString),
      );
      expect(metadataRepository.save.mock.calls[0][0].toPrimitives()).toEqual(
        candidate.toPrimitives(),
      );
      expect(metadataRepository.save.mock.calls[0][1]).toEqual(
        new IPFSId(candidateCidString),
      );
      expect(result.toPrimitives()).toEqual(candidate.toPrimitives());
    });

    it('should not resolve previous identity versions for trusted mongo metadata', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafypreviousidentity';
      const currentCidString = 'bafycurrentidentity';
      const candidate = await previousIdentity.updateProfile(
        new Profile(new ProfileName('Jane')),
        mother.password,
        new IdentityExternalIdentifier(previousCidString),
      );

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: currentCidString,
          identityId: previousPrimitives.id,
          previousCid: previousCidString,
          receivedAt: Date.now(),
          version: candidate.toPrimitives().version,
        },
      ]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(candidate));

      const result = await repository.findById(
        new IdentityId(previousPrimitives.id),
      );

      expect(ipfsManager.getJSON).toHaveBeenCalledTimes(1);
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(currentCidString),
      );
      expect(result.toPrimitives()).toEqual(candidate.toPrimitives());
    });

    it('should use local identity metadata before DHT fallback', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafycachedidentity';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: cidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findById(identityId);

      expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should reject a DHT candidate with a missing previous identity', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafyunknownpreviousidentity';
      const candidateCidString = 'bafyupdatedidentity';
      const candidate = await previousIdentity.updateProfile(
        new Profile(new ProfileName('Jane')),
        mother.password,
        new IdentityExternalIdentifier(previousCidString),
      );

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([candidateCidString]);
      ipfsManager.getJSON
        .mockResolvedValueOnce(mapper.toDocument(candidate))
        .mockRejectedValueOnce(new Error('missing previous identity'));

      await expect(
        repository.findById(new IdentityId(previousPrimitives.id)),
      ).rejects.toThrow(IdentityNotFoundError);
      expect(
        metadataRepository.deleteByExternalIdentifier,
      ).toHaveBeenCalledWith(new IPFSId(candidateCidString));
      expect(metadataRepository.save).not.toHaveBeenCalled();
    });

    it('should try latest metadata before DHT fallback when no peers are connected', async () => {
      const identityId = mother.id;
      const cid = new IPFSId('bafyremoteidentity');

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: cid.valueOf(),
          identityId: identityId.valueOf(),
          previousCid: undefined,
          receivedAt: Date.now(),
          version: 1,
        },
      ]);
      ipfsManager.hasConnectedPeers.mockResolvedValue(false);
      ipfsManager.getJSON.mockRejectedValue(new Error('missing identity'));

      await expect(repository.findById(identityId)).rejects.toThrow(
        IdentityNotFoundError,
      );

      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(cid);
      expect(
        metadataRepository.deleteByExternalIdentifier,
      ).toHaveBeenCalledWith(cid);
    });
  });

  describe('findCandidateByHandle', () => {
    it('should return the handle candidate without resolving it again by id', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'hasko',
      );
      const primitives = identity.toPrimitives();
      const handle = new ProfileHandle('hasko');
      const cidString = 'bafyhandleidentity';

      metadataRepository.findByHandle.mockResolvedValue([
        {
          cid: cidString,
          handle: 'hasko',
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findCandidateByHandle(handle);

      expect(metadataRepository.findByHandle).toHaveBeenCalledWith(handle);
      expect(metadataRepository.findByIdentityId).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.stat).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).toHaveBeenCalledTimes(1);
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(result.externalIdentifier).toEqual(
        new IdentityExternalIdentifier(cidString),
      );
      expect(result.identity.toPrimitives()).toEqual(primitives);
    });

    it('should not fetch older handle metadata when the latest candidate is valid', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'hasko',
      );
      const primitives = identity.toPrimitives();
      const handle = new ProfileHandle('hasko');
      const latestCidString = 'bafylatesthandleidentity';
      const olderCidString = 'bafyolderhandleidentity';

      metadataRepository.findByHandle.mockResolvedValue([
        {
          cid: latestCidString,
          handle: 'hasko',
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
        {
          cid: olderCidString,
          handle: 'hasko',
          identityId: primitives.id,
          previousCid: undefined,
          receivedAt: Date.now() - 1,
          version: primitives.version - 1,
        },
      ]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findCandidateByHandle(handle);

      expect(ipfsManager.getJSON).toHaveBeenCalledTimes(1);
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(latestCidString),
      );
      expect(ipfsManager.getJSON).not.toHaveBeenCalledWith(
        new IPFSId(olderCidString),
      );
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(result.identity.toPrimitives()).toEqual(primitives);
    });

    it('should read handle metadata from the known identity networks', async () => {
      const networkId = '550e8400-e29b-41d4-a716-446655440000';
      const identity = await createSignedIdentityForNetwork(networkId, 'hasko');
      const primitives = identity.toPrimitives();
      const handle = new ProfileHandle('hasko');
      const cidString = 'bafynetworkhandleidentity';

      metadataRepository.findByHandle.mockResolvedValue([
        {
          cid: cidString,
          handle: 'hasko',
          identityId: primitives.id,
          networkIds: [networkId],
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSONFromNetworks.mockResolvedValue(
        mapper.toDocument(identity),
      );

      const result = await repository.findCandidateByHandle(handle);

      expect(ipfsManager.getJSONFromNetworks).toHaveBeenCalledWith(
        new IPFSId(cidString),
        [networkId],
      );
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.getBytesFromNetworks).not.toHaveBeenCalled();
      expect(result.identity.toPrimitives()).toEqual(primitives);
    });
  });
});
