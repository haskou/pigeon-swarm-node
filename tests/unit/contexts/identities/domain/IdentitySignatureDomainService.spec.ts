import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';

describe('IdentitySignatureDomainService', () => {
  it('builds identity canonical signing content', () => {
    const serializedPayload =
      new IdentitySignatureDomainService().getCanonicalSigningContent(
        IdentitySignaturePayload.fromPrimitives({
          encryptedKeyPair: {
            encryptedPrivateKey: 'encrypted-private-key',
            publicKey: 'public-key',
          },
          encryptedMasterKey: 'encrypted-master-key',
          id: 'identity-id',
          masterKeyDerivation: {
            algorithm: 'scrypt',
            N: 262144,
            r: 8,
            p: 1,
            salt: 'base64urlSalt',
            version: 1,
            recoveryKey: {
              algorithm: 'pigeon-recovery-key',
              version: 1,
            },
          },
          networks: ['network-id'],
          previousIdentityExternalIdentifier: 'previous-identity-cid',
          profile: {
            banner: 'banner-cid',
            biography: 'bio',
            handle: 'handle',
            name: 'Name',
            picture: 'picture-cid',
          },
          timestamp: 1778536870557,
          version: 2,
        }),
      );

    expect(serializedPayload).toBe(
      '{"encryptedKeyPair":{"encryptedPrivateKey":"encrypted-private-key","publicKey":"public-key"},"encryptedMasterKey":"encrypted-master-key","id":"identity-id","masterKeyDerivation":{"algorithm":"scrypt","N":262144,"r":8,"p":1,"salt":"base64urlSalt","version":1,"recoveryKey":{"algorithm":"pigeon-recovery-key","version":1}},"networks":["network-id"],"previousIdentityExternalIdentifier":"previous-identity-cid","profile":{"banner":"banner-cid","biography":"bio","handle":"handle","name":"Name","picture":"picture-cid"},"timestamp":1778536870557,"version":2}',
    );
    expect(serializedPayload).toContain('"recoveryKey"');
    expect(serializedPayload).not.toContain('passkeyPrf');
    expect(serializedPayload).not.toContain('encryptedPasswordKey');
    expect(serializedPayload).not.toContain('keyAlgorithm');
  });
});
