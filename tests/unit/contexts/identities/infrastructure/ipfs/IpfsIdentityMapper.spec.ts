import { IpfsIdentityDocument } from '../../../../../../src/contexts/identities/infrastructure/ipfs/documents/IpfsIdentityDocument';
import IpfsIdentityMapper from '../../../../../../src/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { IdentityMother } from '../../../../mothers/IdentityMother';
import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

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

      expect(document).toEqual(
        expect.objectContaining({
          authorizationRevision: 0,
          deviceCredential: expect.any(String),
          deviceCredentialCommitment: expect.any(String),
          recoveryAuthority: expect.any(String),
        }),
      );
      expect(document).not.toHaveProperty('encryptedKeyPair');
      expect(document).not.toHaveProperty('encryptedMasterKey');
      expect(document).not.toHaveProperty('masterKeyDerivation');
      expect(document._id).toBe(primitives.id);
      expect(document.networks).toEqual(primitives.networks);
      expect(document.previousCid).toBe(
        primitives.previousIdentityExternalIdentifier,
      );
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
        admissionNonce: primitives.admissionNonce,
        authorizationRevision: primitives.authorizationRevision,
        deviceCredential: primitives.deviceCredential,
        deviceCredentialCommitment: primitives.deviceCredentialCommitment,
        networks: primitives.networks,
        previousCid: primitives.previousIdentityExternalIdentifier,
        profile: primitives.profile,
        recoveryAuthority: primitives.recoveryAuthority,
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

  describe('mailbox home', () => {
    it('should map the mailbox home to and from the IPFS document', async () => {
      const identity = (await SignedIdentityMother.create()).build({
        mailboxHome: 'https://node.example',
      });

      const document = mapper.toDocument(identity);

      expect(document.mailboxHome).toBe('https://node.example');
      expect(mapper.toDomain(document).toPrimitives()).toEqual(
        identity.toPrimitives(),
      );
    });

    it('should omit the mailbox home from documents of identities without one', async () => {
      const json = JSON.parse(
        JSON.stringify(mapper.toDocument(await mother.build())),
      );

      expect(json).not.toHaveProperty('mailboxHome');
    });
  });
});
