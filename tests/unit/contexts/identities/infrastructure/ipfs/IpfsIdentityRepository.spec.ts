import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityNotFoundError } from '../../../../../../src/contexts/identities/domain/errors/IdentityNotFoundError';
import IpfsIdentityRepository from '../../../../../../src/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import IpfsIdentityMapper from '../../../../../../src/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { IdentityId } from '../../../../../../src/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IpfsIdentityRepository', () => {
  let ipfsManager: MockProxy<IPFS>;
  let mapper: IpfsIdentityMapper;
  let repository: IpfsIdentityRepository;
  let mother: IdentityMother;

  beforeEach(() => {
    ipfsManager = mock<IPFS>();
    mapper = new IpfsIdentityMapper();
    repository = new IpfsIdentityRepository(ipfsManager, mapper);
    mother = new IdentityMother();
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
          previousCid: primitives.previousCid,
          version: primitives.version,
        }),
        primitives.networks,
      );
      expect(ipfsManager.putRecordToNetworks).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
        expectedCid.valueOf(),
        primitives.networks,
      );
    });
  });

  describe('findById', () => {
    it('should find identity by looking up record and fetching JSON', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const identityId = new IdentityId(primitives.id);
      const cidString = 'bafystoredcid';

      ipfsManager.getRecord.mockResolvedValue(cidString);
      ipfsManager.getJSON.mockResolvedValue({
        _id: primitives.id,
        encryptedKeyPair: primitives.encryptedKeyPair,
        networks: primitives.networks,
        previousCid: primitives.previousCid,
        profile: primitives.profile,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      });

      const result = await repository.findById(identityId);

      expect(ipfsManager.getRecord).toHaveBeenCalledWith(
        'pigeon-swarm_identity-' + primitives.id,
      );
      expect(ipfsManager.getJSON).toHaveBeenCalledWith(new IPFSId(cidString));
      expect(result.toPrimitives()).toEqual(primitives);
    });

    it('should throw IdentityNotFoundError when no record exists', async () => {
      const identity = await mother.build();
      const identityId = new IdentityId(identity.toPrimitives().id);

      ipfsManager.getRecord.mockResolvedValue(undefined);

      await expect(repository.findById(identityId)).rejects.toThrow(
        IdentityNotFoundError,
      );
    });
  });
});
