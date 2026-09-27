import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';

describe('IdentitySignatureDomainService', () => {
  it('builds identity canonical signing content', () => {
    const serializedPayload =
      new IdentitySignatureDomainService().getCanonicalSigningContent(
        IdentitySignaturePayload.fromPrimitives({
          authorizationRevision: 3,
          deviceCredential: 'device-credential',
          deviceCredentialCommitment: 'credential-commitment',
          id: 'identity-id',
          networks: ['network-id'],
          previousIdentityExternalIdentifier: 'previous-identity-cid',
          profile: {
            banner: 'banner-cid',
            biography: 'bio',
            handle: 'handle',
            name: 'Name',
            picture: 'picture-cid',
          },
          recoveryAuthority: 'recovery-public-key',
          timestamp: 1778536870557,
          version: 2,
        }),
      );

    expect(serializedPayload).toBe(
      '{"authorizationRevision":3,"deviceCredential":"device-credential","deviceCredentialCommitment":"credential-commitment","id":"identity-id","networks":["network-id"],"previousIdentityExternalIdentifier":"previous-identity-cid","profile":{"banner":"banner-cid","biography":"bio","handle":"handle","name":"Name","picture":"picture-cid"},"recoveryAuthority":"recovery-public-key","timestamp":1778536870557,"version":2}',
    );
    expect(serializedPayload).not.toContain('encryptedPrivateKey');
    expect(serializedPayload).not.toContain('encryptedMasterKey');
    expect(serializedPayload).not.toContain('masterKeyDerivation');
  });
});
