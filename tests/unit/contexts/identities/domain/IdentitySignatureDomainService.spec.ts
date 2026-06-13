import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';

describe('IdentitySignatureDomainService', () => {
  it('serializes identity payloads with the public signing contract order', () => {
    const serializedPayload = new IdentitySignatureDomainService().serializePayload({
      encryptedKeyPair: {
        encryptedPrivateKey: 'encrypted-private-key',
        publicKey: 'public-key',
      },
      encryptedMasterKey: 'encrypted-master-key',
      id: 'identity-id',
      masterKeyDerivation: {
        passkeyPrf: {
          algorithm: 'webauthn-prf',
          credentialId: 'credential-id',
          salt: 'base64urlSalt',
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
    });

    expect(serializedPayload).toBe(
      '{"encryptedKeyPair":{"encryptedPrivateKey":"encrypted-private-key","publicKey":"public-key"},"encryptedMasterKey":"encrypted-master-key","id":"identity-id","masterKeyDerivation":{"passkeyPrf":{"algorithm":"webauthn-prf","credentialId":"credential-id","salt":"base64urlSalt","version":1}},"networks":["network-id"],"previousIdentityExternalIdentifier":"previous-identity-cid","profile":{"banner":"banner-cid","biography":"bio","handle":"handle","name":"Name","picture":"picture-cid"},"timestamp":1778536870557,"version":2}',
    );
    expect(serializedPayload).not.toContain('encryptedPasswordKey');
    expect(serializedPayload).not.toContain('keyAlgorithm');
  });
});
