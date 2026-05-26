import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityNotFoundError } from '../../../../../../src/contexts/identities/domain/errors/IdentityNotFoundError';
import { Identity } from '../../../../../../src/contexts/identities/domain/Identity';
import { Profile } from '../../../../../../src/contexts/identities/domain/Profile';
import { IdentityExternalIdentifier } from '../../../../../../src/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileName } from '../../../../../../src/contexts/identities/domain/value-objects/ProfileName';
import IpfsIdentityRepository from '../../../../../../src/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import IpfsIdentityMapper from '../../../../../../src/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import MongoIdentityMetadataRepository from '../../../../../../src/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '../../../../../../src/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '../../../../../../src/contexts/shared/domain/value-objects/Password';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IpfsIdentityRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsIdentityMapper;
  let metadataRepository: MockProxy<MongoIdentityMetadataRepository>;
  let repository: IpfsIdentityRepository;
  let mother: IdentityMother;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsIdentityMapper();
    metadataRepository = mock<MongoIdentityMetadataRepository>();
    repository = new IpfsIdentityRepository(
      ipfsManager,
      mapper,
      metadataRepository,
    );
    mother = new IdentityMother();
    ipfsManager.getRecordCandidates.mockResolvedValue([]);
  });

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
          _id: primitives.id,
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
    it('should find identity using mongo metadata before DHT fallback', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          _id: primitives.id + ':' + cidString,
          cid: cidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSON.mockResolvedValue({
        _id: primitives.id,
        encryptedKeyPair: primitives.encryptedKeyPair,
        networks: primitives.networks,
        previousCid: primitives.previousIdentityExternalIdentifier,
        profile: primitives.profile,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      });

      const result = await repository.findById(identityId);

      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should not wait for DHT candidates when mongo has a valid candidate', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const mongoCidString = 'bafymongocid';
      const dhtCidString = 'bafydhtcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          _id: primitives.id + ':' + mongoCidString,
          cid: mongoCidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getRecordCandidates.mockResolvedValue([dhtCidString]);
      ipfsManager.getJSON.mockResolvedValue({
        _id: primitives.id,
        encryptedKeyPair: primitives.encryptedKeyPair,
        networks: primitives.networks,
        previousCid: primitives.previousIdentityExternalIdentifier,
        profile: primitives.profile,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      });

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

    it('should fallback to DHT and cache metadata when mongo has no candidates', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([cidString]);
      ipfsManager.getJSON.mockResolvedValue({
        _id: primitives.id,
        encryptedKeyPair: primitives.encryptedKeyPair,
        networks: primitives.networks,
        previousCid: primitives.previousIdentityExternalIdentifier,
        profile: primitives.profile,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      });

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

    it('should delete broken mongo metadata and fallback to DHT', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const brokenCidString = 'bafybrokencid';
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          _id: primitives.id + ':' + brokenCidString,
          cid: brokenCidString,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          receivedAt: Date.now(),
          version: primitives.version,
        },
      ]);
      ipfsManager.getJSON
        .mockRejectedValueOnce(new Error('missing block'))
        .mockResolvedValueOnce({
          _id: primitives.id,
          encryptedKeyPair: primitives.encryptedKeyPair,
          networks: primitives.networks,
          previousCid: primitives.previousIdentityExternalIdentifier,
          profile: primitives.profile,
          signature: primitives.signature,
          timestamp: primitives.timestamp,
          version: primitives.version,
        });
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
      const otherIdentity = await Identity.create(
        new ProfileName('Mallory'),
        new Password('Super-secret-password1!'),
        [new NetworkId(primitives.networks[0])],
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
          _id: previousPrimitives.id + ':' + currentCidString,
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
  });
});
