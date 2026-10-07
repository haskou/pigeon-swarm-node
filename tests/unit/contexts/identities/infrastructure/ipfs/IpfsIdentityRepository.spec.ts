import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityNotFoundError } from '../../../../../../src/contexts/identities/domain/errors/IdentityNotFoundError';
import { Identity } from '../../../../../../src/contexts/identities/domain/Identity';
import { Profile } from '../../../../../../src/contexts/identities/domain/Profile';
import { DeviceCredential } from '../../../../../../src/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityExternalIdentifier } from '../../../../../../src/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../../../../../src/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '../../../../../../src/contexts/identities/domain/value-objects/ProfileName';
import IpfsIdentityRepository from '../../../../../../src/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import IpfsIdentityMapper from '../../../../../../src/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import IdentityMetadataIndex from '../../../../../../src/contexts/identities/infrastructure/metadata/IdentityMetadataIndex';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IpfsIdentityRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsIdentityMapper;
  let metadataRepository: MockProxy<IdentityMetadataIndex>;
  let repository: IpfsIdentityRepository;
  let mother: IdentityMother;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsIdentityMapper();
    metadataRepository = mock<IdentityMetadataIndex>();
    repository = new IpfsIdentityRepository(
      ipfsManager,
      mapper,
      metadataRepository,
    );
    mother = new IdentityMother();
    ipfsManager.getRecordCandidates.mockResolvedValue([]);
    ipfsManager.stat.mockResolvedValue(true);
    ipfsManager.hasConnectedPeers.mockResolvedValue(false);
    ipfsManager.findConnectedNetworkIds.mockImplementation(
      async (networkIds) => networkIds,
    );
  });

  async function createSignedIdentityForNetwork(
    networkId: string,
    handle?: string,
  ): Promise<Identity> {
    const keyPair = await KeyPair.generate();
    const deviceKeyPair = await KeyPair.generate();
    const recoveryKeyPair = await KeyPair.generate();
    const deviceCredential = DeviceCredential.fromString(
      deviceKeyPair.toPrimitives().publicKey,
    );
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const previousIdentityExternalIdentifier: string | undefined = undefined;
    const signaturePayload = {
      authorizationRevision: 0,
      deviceCredential: deviceCredential.valueOf(),
      deviceCredentialCommitment: deviceCredential.getCommitment().valueOf(),
      id: identityId.valueOf(),
      networks: [networkId],
      previousIdentityExternalIdentifier,
      profile: new Profile(
        new ProfileName('Mallory'),
        undefined,
        undefined,
        undefined,
        handle ? new ProfileHandle(handle) : undefined,
      ).toPrimitives(),
      recoveryAuthority: recoveryKeyPair.toPrimitives().publicKey,
      timestamp: 1773848829055,
      version: 1,
    };

    return Identity.fromPrimitives({
      ...signaturePayload,
      signature: keyPair.sign(JSON.stringify(signaturePayload)).valueOf(),
    });
  }

  describe('save', () => {
    it('calculates the content identifier without publishing the identity', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      const expectedCid = new IPFSId('bafyresultcid');
      ipfsManager.calculateJSONId.mockResolvedValue(expectedCid);

      const externalIdentifier =
        await repository.calculateExternalIdentifier(identity);

      expect(ipfsManager.calculateJSONId).toHaveBeenCalledWith(
        mapper.toDocument(identity),
      );
      expect(externalIdentifier.valueOf()).toBe(expectedCid.valueOf());
      expect(ipfsManager.addJSONToNetworks).not.toHaveBeenCalled();
      expect(ipfsManager.putRecordToNetworks).not.toHaveBeenCalled();
      expect(metadataRepository.save).not.toHaveBeenCalled();
    });

    it('should save identity document to all networks and put record', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'mallory',
      );
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
      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-handle-' + primitives.profile.handle,
        expectedCid.valueOf(),
        primitives.networks,
      );
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        expectedCid,
      );
    });

    it('should republish only the latest identity routing record without adding content again', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'mallory',
      );
      const primitives = identity.toPrimitives();

      metadataRepository.findAllCanonical.mockResolvedValue([
        {
          cid: 'bafy-identity-v2',
          identity,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: 'bafy-identity-v1',
          version: 2,
        },
        {
          cid: 'bafy-identity-v1',
          identity,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: undefined,
          version: 1,
        },
      ]);
      ipfsManager.putRecordToNetworks.mockResolvedValue(undefined);

      const republished = await repository.republishLocalRoutingRecords();

      expect(republished).toBe(1);
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.addJSONToNetworks).not.toHaveBeenCalled();
      expect(metadataRepository.save).not.toHaveBeenCalled();
      expect(ipfsManager.findConnectedNetworkIds).toHaveBeenCalledWith(
        primitives.networks,
      );
      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
        'bafy-identity-v2',
        primitives.networks,
      );
    });

    it('should republish the canonical CID for equal-version forks', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'mallory',
      );
      const primitives = identity.toPrimitives();

      metadataRepository.findAllCanonical.mockResolvedValue([
        {
          cid: 'bafy-b-fork',
          identity,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: undefined,
          version: 1,
        },
        {
          cid: 'bafy-a-fork',
          identity,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: undefined,
          version: 1,
        },
      ]);

      await repository.republishLocalRoutingRecords();

      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
        'bafy-a-fork',
        primitives.networks,
      );
    });

    it('should skip identity metadata without known networks', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const cid = 'bafy-identity-without-networks';

      metadataRepository.findAllCanonical.mockResolvedValue([
        {
          cid,
          identity,
          identityId: primitives.id,
          previousCid: 'bafy-identity-v1',
          version: 2,
        },
      ]);
      ipfsManager.putRecordToNetworks.mockResolvedValue(undefined);

      const republished = await repository.republishLocalRoutingRecords();

      expect(republished).toBe(0);
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.addJSONToNetworks).not.toHaveBeenCalled();
      expect(metadataRepository.save).not.toHaveBeenCalled();
      expect(ipfsManager.findConnectedNetworkIds).not.toHaveBeenCalled();
      expect(ipfsManager.putRecordToNetworks).not.toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
        cid,
        expect.any(Array),
      );
    });

    it('should skip identity routing metadata when known networks have no connected peers', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();

      metadataRepository.findAllCanonical.mockResolvedValue([
        {
          cid: 'bafy-identity-v2',
          identity,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: 'bafy-identity-v1',
          version: 2,
        },
      ]);
      ipfsManager.findConnectedNetworkIds.mockResolvedValue([]);

      const republished = await repository.republishLocalRoutingRecords();

      expect(republished).toBe(0);
      expect(ipfsManager.findConnectedNetworkIds).toHaveBeenCalledWith(
        primitives.networks,
      );
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.addJSONToNetworks).not.toHaveBeenCalled();
      expect(metadataRepository.save).not.toHaveBeenCalled();
      expect(ipfsManager.putRecordToNetworks).not.toHaveBeenCalled();
    });

    it('should resolve connected networks once per identity republish pass', async () => {
      const connectedNetworkId = '550e8400-e29b-41d4-a716-446655440000';
      const disconnectedNetworkId = '550e8400-e29b-41d4-a716-446655440001';
      const connectedIdentity = await createSignedIdentityForNetwork(
        connectedNetworkId,
        'connected',
      );
      const disconnectedIdentity = await createSignedIdentityForNetwork(
        disconnectedNetworkId,
        'disconnected',
      );
      const connectedPrimitives = connectedIdentity.toPrimitives();
      const disconnectedPrimitives = disconnectedIdentity.toPrimitives();

      metadataRepository.findAllCanonical.mockResolvedValue([
        {
          cid: 'bafy-connected-identity',
          identity: connectedIdentity,
          identityId: connectedPrimitives.id,
          networkIds: connectedPrimitives.networks,
          previousCid: undefined,
          version: 1,
        },
        {
          cid: 'bafy-disconnected-identity',
          identity: disconnectedIdentity,
          identityId: disconnectedPrimitives.id,
          networkIds: disconnectedPrimitives.networks,
          previousCid: undefined,
          version: 1,
        },
      ]);
      ipfsManager.findConnectedNetworkIds.mockResolvedValue([
        connectedNetworkId,
      ]);

      const republished = await repository.republishLocalRoutingRecords();

      expect(republished).toBe(1);
      expect(ipfsManager.findConnectedNetworkIds).toHaveBeenCalledTimes(1);
      expect(ipfsManager.findConnectedNetworkIds).toHaveBeenCalledWith([
        connectedNetworkId,
        disconnectedNetworkId,
      ]);
      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + connectedPrimitives.id,
        'bafy-connected-identity',
        [connectedNetworkId],
      );
      expect(ipfsManager.putRecordToNetworks).not.toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + disconnectedPrimitives.id,
        'bafy-disconnected-identity',
        expect.any(Array),
      );
    });

    it('should republish identity routing records only for the requested network', async () => {
      const requestedNetworkId = '550e8400-e29b-41d4-a716-446655440000';
      const otherNetworkId = '550e8400-e29b-41d4-a716-446655440001';
      const requestedIdentity = await createSignedIdentityForNetwork(
        requestedNetworkId,
        'requested',
      );
      const otherIdentity = await createSignedIdentityForNetwork(
        otherNetworkId,
        'other',
      );
      const requestedPrimitives = requestedIdentity.toPrimitives();
      const otherPrimitives = otherIdentity.toPrimitives();

      metadataRepository.findAllCanonical.mockResolvedValue([
        {
          cid: 'bafy-requested-identity',
          identity: requestedIdentity,
          identityId: requestedPrimitives.id,
          networkIds: requestedPrimitives.networks,
          previousCid: undefined,
          version: 1,
        },
        {
          cid: 'bafy-other-identity',
          identity: otherIdentity,
          identityId: otherPrimitives.id,
          networkIds: otherPrimitives.networks,
          previousCid: undefined,
          version: 1,
        },
      ]);
      ipfsManager.findConnectedNetworkIds.mockResolvedValue([
        requestedNetworkId,
      ]);

      const republished =
        await repository.republishLocalRoutingRecords(requestedNetworkId);

      expect(republished).toBe(1);
      expect(ipfsManager.findConnectedNetworkIds).toHaveBeenCalledWith([
        requestedNetworkId,
      ]);
      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + requestedPrimitives.id,
        'bafy-requested-identity',
        [requestedNetworkId],
      );
      expect(ipfsManager.putRecordToNetworks).not.toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + otherPrimitives.id,
        'bafy-other-identity',
        expect.any(Array),
      );
    });
  });

  describe('findCandidateByExternalIdentifier', () => {
    it('should validate and register the exact announced identity candidate', async () => {
      const identity = await mother.build();
      const identityId = mother.id;
      const externalIdentifier = new IdentityExternalIdentifier(
        'bafy-announced-identity',
      );

      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const candidate = await repository.findCandidateByExternalIdentifier(
        identityId,
        externalIdentifier,
      );

      expect(candidate.getIdentity().toPrimitives()).toEqual(
        identity.toPrimitives(),
      );
      expect(
        candidate.getExternalIdentifier().isEqual(externalIdentifier),
      ).toBe(true);
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        new IPFSId(externalIdentifier.valueOf()),
      );
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
    });

    it('should reject an announced candidate belonging to another identity', async () => {
      const announcedIdentity = await mother.build();
      const otherIdentity = await createSignedIdentityForNetwork(
        announcedIdentity.toPrimitives().networks[0],
      );
      const externalIdentifier = new IdentityExternalIdentifier(
        'bafy-wrong-announced-identity',
      );

      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(otherIdentity));

      await expect(
        repository.findCandidateByExternalIdentifier(
          mother.id,
          externalIdentifier,
        ),
      ).rejects.toThrow(IdentityNotFoundError);
      expect(metadataRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find identity from embedded metadata before DHT fallback', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: cidString,
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(new IPFSId(cidString));

      const result = await repository.findById(identityId);

      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
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
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId('bafyembeddedidentity'),
      );

      const result = await repository.findById(identityId);

      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should reject an embedded identity whose metadata CID addresses different content', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const metadataCid = new IPFSId('bafy-forged-label');

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: metadataCid.valueOf(),
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId('bafy-authentic-content'),
      );

      await expect(
        repository.findById(new IdentityId(primitives.id)),
      ).rejects.toThrow(IdentityNotFoundError);
    });

    it('should bound the number and size of remotely routed identity documents', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue(
        Array.from({ length: 100 }, (_, index) => `bafyremote${index}`),
      );
      ipfsManager.getJSON.mockRejectedValue(new Error('too large'));
      ipfsManager.getBytes.mockRejectedValue(new Error('too large'));

      await expect(
        repository.findById(new IdentityId(primitives.id)),
      ).rejects.toThrow(IdentityNotFoundError);

      expect(ipfsManager.getJSON).toHaveBeenCalledTimes(32);
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        expect.anything(),
        64 * 1024,
      );
      expect(ipfsManager.getBytes).toHaveBeenCalledWith(
        expect.anything(),
        64 * 1024,
      );
    });

    it('should recover a valid routed CID after rejecting forged embedded metadata', async () => {
      const validIdentity = await mother.build();
      const forgedIdentity = await createSignedIdentityForNetwork(
        validIdentity.toPrimitives().networks[0],
      );
      const primitives = validIdentity.toPrimitives();
      const cid = new IPFSId('bafy-valid-routed-identity');

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: cid.valueOf(),
          identity: forgedIdentity,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId('bafy-forged-content'),
      );
      ipfsManager.hasConnectedPeers.mockResolvedValue(true);
      ipfsManager.getRecordCandidates.mockResolvedValue([cid.valueOf()]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(validIdentity));

      const result = await repository.findFreshCandidateReferencesById(
        new IdentityId(primitives.id),
      );

      expect(result[0].getIdentity().toPrimitives()).toEqual(primitives);
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(cid, 64 * 1024);
    });

    it('should select same-version cached forks independently of receipt order', async () => {
      const preferred = await mother.buildNext({
        networks: ['550e8400-e29b-41d4-a716-446655440001'],
        previousIdentityExternalIdentifier: undefined,
        version: 1,
      });
      const other = await mother.buildNext({
        networks: ['550e8400-e29b-41d4-a716-446655440002'],
        previousIdentityExternalIdentifier: undefined,
        version: 1,
      });
      const primitives = preferred.toPrimitives();

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: 'bafy-b-fork',
          identity: other,
          identityId: primitives.id,
          networkIds: other.toPrimitives().networks,
          previousCid: undefined,
          version: 1,
        },
        {
          cid: 'bafy-a-fork',
          identity: preferred,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: undefined,
          version: 1,
        },
      ]);
      ipfsManager.calculateJSONId.mockImplementation(async (document) => {
        const networks = (document as { networks: string[] }).networks;

        return new IPFSId(
          networks.includes('550e8400-e29b-41d4-a716-446655440001')
            ? 'bafy-a-fork'
            : 'bafy-b-fork',
        );
      });

      const result = await repository.findById(new IdentityId(primitives.id));

      expect(result.getNetworkIds()).toEqual(preferred.getNetworkIds());
    });

    it('should reject an embedded metadata identity that rolls back authorization revision', async () => {
      const genesis = await mother.buildNext({
        previousIdentityExternalIdentifier: undefined,
        version: 1,
      });
      const advanced = await mother.buildNext({
        authorizationRevision: 2,
        previousIdentityExternalIdentifier: 'bafy-identity-v1',
        version: 2,
      });
      const rollback = await mother.buildNext({
        authorizationRevision: 1,
        previousIdentityExternalIdentifier: 'bafy-identity-v2',
        version: 3,
      });
      const primitives = rollback.toPrimitives();

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: 'bafy-identity-v3',
          identity: rollback,
          identityId: primitives.id,
          networkIds: primitives.networks,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId('bafy-identity-v3'),
      );
      ipfsManager.getJSONFromNetworks.mockImplementation(
        <T>(cid: IPFSId): Promise<T> => {
          const identity =
            cid.valueOf() === 'bafy-identity-v2' ? advanced : genesis;

          return Promise.resolve(mapper.toDocument(identity) as T);
        },
      );

      const result = await repository.findById(new IdentityId(primitives.id));

      expect(result.toPrimitives()).toEqual(advanced.toPrimitives());
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
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.getRecordCandidates.mockResolvedValue([dhtCidString]);
      ipfsManager.calculateJSONId.mockResolvedValue(new IPFSId(mongoCidString));

      const result = await repository.findCandidatesById(identityId);

      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should return local metadata without waiting for remote refresh', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafyidentity-v1';
      const currentCidString = 'bafyidentity-v2';
      const currentIdentity = await mother.buildNext({
        previousIdentityExternalIdentifier: previousCidString,
        profile: new Profile(new ProfileName('Jane')).toPrimitives(),
      });

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: previousCidString,
          identity: previousIdentity,
          identityId: previousPrimitives.id,
          previousCid: previousPrimitives.previousIdentityExternalIdentifier,
          version: previousPrimitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId(previousCidString),
      );
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

      expect(result.toPrimitives()).toEqual(previousIdentity.toPrimitives());
      await flushBackgroundTasks();
      expect(ipfsManager.getRecordCandidates).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + previousPrimitives.id,
      );
    });

    it('should await remote candidates for a fresh security-sensitive lookup', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCid = new IPFSId('bafyidentity-v1');
      const currentCid = new IPFSId('bafyidentity-v2');
      const currentIdentity = await mother.buildNext({
        previousIdentityExternalIdentifier: previousCid.valueOf(),
        profile: new Profile(new ProfileName('Jane')).toPrimitives(),
      });
      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: previousCid.valueOf(),
          identity: previousIdentity,
          identityId: previousPrimitives.id,
          previousCid: previousPrimitives.previousIdentityExternalIdentifier,
          version: previousPrimitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(previousCid);
      ipfsManager.hasConnectedPeers.mockResolvedValue(true);
      ipfsManager.getRecordCandidates.mockResolvedValue([currentCid.valueOf()]);
      ipfsManager.getJSON.mockImplementation(<T>(cid: IPFSId): Promise<T> => {
        const identity = cid.isEqual(currentCid)
          ? currentIdentity
          : previousIdentity;

        return Promise.resolve(mapper.toDocument(identity) as T);
      });

      const [candidate] = await repository.findFreshCandidateReferencesById(
        new IdentityId(previousPrimitives.id),
      );

      expect(candidate.getIdentity().toPrimitives()).toEqual(
        currentIdentity.toPrimitives(),
      );
      expect(ipfsManager.getRecordCandidates).toHaveBeenCalled();
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
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(cidString),
        64 * 1024,
      );
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        new IPFSId(cidString),
      );
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should fall back to DHT when embedded metadata does not match its content id', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const brokenCidString = 'bafybrokencid';
      const cidString = 'bafystoredcid';

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: brokenCidString,
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValueOnce(
        new IPFSId('bafyauthenticcid'),
      );
      ipfsManager.getJSON.mockResolvedValueOnce(mapper.toDocument(identity));
      ipfsManager.hasConnectedPeers.mockResolvedValue(true);
      ipfsManager.getRecordCandidates.mockResolvedValue([cidString]);

      const result = await repository.findById(identityId);
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
      expect(metadataRepository.save).not.toHaveBeenCalled();
    });

    it('should accept a DHT candidate with a valid previous chain', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafypreviousidentity';
      const candidateCidString = 'bafyupdatedidentity';
      const candidate = await mother.buildNext({
        previousIdentityExternalIdentifier: previousCidString,
        profile: new Profile(new ProfileName('Jane')).toPrimitives(),
      });

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
        64 * 1024,
      );
      expect(metadataRepository.save.mock.calls[0][0].toPrimitives()).toEqual(
        candidate.toPrimitives(),
      );
      expect(metadataRepository.save.mock.calls[0][1]).toEqual(
        new IPFSId(candidateCidString),
      );
      expect(result.toPrimitives()).toEqual(candidate.toPrimitives());
    });

    it('should validate the previous chain for identity metadata', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafypreviousidentity';
      const currentCidString = 'bafycurrentidentity';
      const candidate = await mother.buildNext({
        previousIdentityExternalIdentifier: previousCidString,
        profile: new Profile(new ProfileName('Jane')).toPrimitives(),
      });

      metadataRepository.findByIdentityId.mockResolvedValue([
        {
          cid: currentCidString,
          identity: candidate,
          identityId: previousPrimitives.id,
          previousCid: previousCidString,
          version: candidate.toPrimitives().version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId(currentCidString),
      );
      ipfsManager.getJSON.mockResolvedValue(
        mapper.toDocument(previousIdentity),
      );

      const result = await repository.findById(
        new IdentityId(previousPrimitives.id),
      );

      expect(ipfsManager.getJSON).toHaveBeenCalledTimes(1);
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(previousCidString),
        64 * 1024,
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
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(new IPFSId(cidString));

      const result = await repository.findById(identityId);

      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should reject a DHT candidate with a missing previous identity', async () => {
      const previousIdentity = await mother.build();
      const previousPrimitives = previousIdentity.toPrimitives();
      const previousCidString = 'bafyunknownpreviousidentity';
      const candidateCidString = 'bafyupdatedidentity';
      const candidate = await mother.buildNext({
        previousIdentityExternalIdentifier: previousCidString,
        profile: new Profile(new ProfileName('Jane')).toPrimitives(),
      });

      metadataRepository.findByIdentityId.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([candidateCidString]);
      ipfsManager.getJSON
        .mockResolvedValueOnce(mapper.toDocument(candidate))
        .mockRejectedValueOnce(new Error('missing previous identity'));

      await expect(
        repository.findById(new IdentityId(previousPrimitives.id)),
      ).rejects.toThrow(IdentityNotFoundError);
      expect(metadataRepository.save).not.toHaveBeenCalled();
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
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(new IPFSId(cidString));
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findCandidateByHandle(handle);

      expect(metadataRepository.findByHandle).toHaveBeenCalledWith(handle);
      expect(metadataRepository.findByIdentityId).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(ipfsManager.stat).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(result.getExternalIdentifier()).toEqual(
        new IdentityExternalIdentifier(cidString),
      );
      expect(result.getIdentity().toPrimitives()).toEqual(primitives);
    });

    it('should resolve handle candidates from routing records when local metadata is missing', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'test',
      );
      const primitives = identity.toPrimitives();
      const handle = new ProfileHandle('test');
      const cidString = 'bafyremotehandleidentity';

      metadataRepository.findByHandle.mockResolvedValue([]);
      ipfsManager.getRecordCandidates.mockResolvedValue([cidString]);
      ipfsManager.getJSON.mockResolvedValue(mapper.toDocument(identity));

      const result = await repository.findCandidateByHandle(handle);

      expect(ipfsManager.getRecordCandidates).toHaveBeenCalledWith(
        'pigeon-swarm_identity-handle-test',
      );
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(
        new IPFSId(cidString),
        64 * 1024,
      );
      expect(metadataRepository.save).toHaveBeenCalledWith(
        identity,
        new IPFSId(cidString),
      );
      expect(result.getExternalIdentifier()).toEqual(
        new IdentityExternalIdentifier(cidString),
      );
      expect(result.getIdentity().toPrimitives()).toEqual(primitives);
    });

    it('should resolve the handle owner returned by the metadata index without fetching content', async () => {
      const identity = await createSignedIdentityForNetwork(
        '550e8400-e29b-41d4-a716-446655440000',
        'hasko',
      );
      const primitives = identity.toPrimitives();
      const handle = new ProfileHandle('hasko');
      const latestCidString = 'bafylatesthandleidentity';

      metadataRepository.findByHandle.mockResolvedValue([
        {
          cid: latestCidString,
          handle: 'hasko',
          identity,
          identityId: primitives.id,
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(
        new IPFSId(latestCidString),
      );

      const result = await repository.findCandidateByHandle(handle);

      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(result.getIdentity().toPrimitives()).toEqual(primitives);
    });

    it('should resolve handle metadata from the local identity cache without reading IPFS', async () => {
      const networkId = '550e8400-e29b-41d4-a716-446655440000';
      const identity = await createSignedIdentityForNetwork(networkId, 'hasko');
      const primitives = identity.toPrimitives();
      const handle = new ProfileHandle('hasko');
      const cid = new IPFSId('bafycachedhandleidentity');

      ipfsManager.addJSONToNetworks.mockResolvedValue(cid);
      ipfsManager.putRecordToNetworks.mockResolvedValue(undefined);
      await repository.save(identity);
      metadataRepository.findByHandle.mockResolvedValue([
        {
          cid: cid.valueOf(),
          identity,
          handle: 'hasko',
          identityId: primitives.id,
          networkIds: [networkId],
          previousCid: primitives.previousIdentityExternalIdentifier,
          version: primitives.version,
        },
      ]);
      ipfsManager.calculateJSONId.mockResolvedValue(cid);

      const result = await repository.findCandidateByHandle(handle);

      expect(ipfsManager.getJSONFromNetworks).not.toHaveBeenCalled();
      expect(ipfsManager.getJSON).not.toHaveBeenCalled();
      expect(ipfsManager.getBytes).not.toHaveBeenCalled();
      expect(ipfsManager.getBytesFromNetworks).not.toHaveBeenCalled();
      expect(ipfsManager.getRecordCandidates).not.toHaveBeenCalled();
      expect(result.getExternalIdentifier()).toEqual(
        new IdentityExternalIdentifier(cid.valueOf()),
      );
      expect(result.getIdentity().toPrimitives()).toEqual(primitives);
    });
  });
});

async function flushBackgroundTasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
