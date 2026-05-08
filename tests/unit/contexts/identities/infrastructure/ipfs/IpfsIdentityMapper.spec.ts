import { IpfsIdentityDocument } from '../../../../../../src/contexts/identities/infrastructure/ipfs/documents/IpfsIdentityDocument';
import IpfsIdentityMapper from '../../../../../../src/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IpfsIdentityMapper', () => {
  let mapper: IpfsIdentityMapper;
  let mother: IdentityMother;

  beforeEach(() => {
    mapper = new IpfsIdentityMapper();
    mother = new IdentityMother();
  });

  describe('toDocument', () => {
    it('should map identity to IPFS document', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();

      const document = mapper.toDocument(identity);

      expect(document._id).toBe(primitives.id);
      expect(document.encryptedKeyPair).toEqual(primitives.encryptedKeyPair);
      expect(document.networks).toEqual(primitives.networks);
      expect(document.previousCid).toBe(primitives.previousIdentityExternalIdentifier);
      expect(document.profile).toEqual(primitives.profile);
      expect(document.signature).toBe(primitives.signature);
      expect(document.timestamp).toBe(primitives.timestamp);
      expect(document.version).toBe(primitives.version);
    });
  });

  describe('toDomain', () => {
    it('should map IPFS document back to identity', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const document: IpfsIdentityDocument = {
        _id: primitives.id,
        encryptedKeyPair: primitives.encryptedKeyPair,
        networks: primitives.networks,
        previousCid: primitives.previousIdentityExternalIdentifier,
        profile: primitives.profile,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      };

      const result = mapper.toDomain(document);

      expect(result.toPrimitives()).toEqual(primitives);
    });
  });

  describe('roundtrip', () => {
    it('should preserve identity data through toDocument and toDomain', async () => {
      const identity = await mother.build();
      const originalPrimitives = identity.toPrimitives();

      const document = mapper.toDocument(identity);
      const restored = mapper.toDomain(document);

      expect(restored.toPrimitives()).toEqual(originalPrimitives);
    });
  });
});
