import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';

describe('KeychainSignatureDomainService', () => {
  it('serializes keychain payloads with the public signing contract order', () => {
    const serializedPayload = new KeychainSignatureDomainService().serializePayload({
      encryptedPayload: 'encrypted-keychain-payload',
      ownerIdentityId: 'identity-id',
      previousKeychainExternalIdentifier: 'previous-keychain-cid',
      timestamp: 1778536870557,
      version: 2,
    });

    expect(serializedPayload).toBe(
      '{"encryptedPayload":"encrypted-keychain-payload","ownerIdentityId":"identity-id","previousKeychainExternalIdentifier":"previous-keychain-cid","timestamp":1778536870557,"version":2}',
    );
  });
});
