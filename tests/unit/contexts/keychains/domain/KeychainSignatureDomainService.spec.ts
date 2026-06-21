import { KeychainSignaturePayload } from '@app/contexts/keychains/domain/KeychainSignaturePayload';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';

describe('KeychainSignatureDomainService', () => {
  it('builds keychain canonical signing content', () => {
    const serializedPayload =
      new KeychainSignatureDomainService().getCanonicalSigningContent(
        KeychainSignaturePayload.fromPrimitives({
          encryptedPayload: 'encrypted-keychain-payload',
          ownerIdentityId: 'identity-id',
          previousKeychainExternalIdentifier: 'previous-keychain-cid',
          timestamp: 1778536870557,
          version: 2,
        }),
      );

    expect(serializedPayload).toBe(
      '{"encryptedPayload":"encrypted-keychain-payload","ownerIdentityId":"identity-id","previousKeychainExternalIdentifier":"previous-keychain-cid","timestamp":1778536870557,"version":2}',
    );
  });
});
