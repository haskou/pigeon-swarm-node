import IpfsKeychainMapper from '@app/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('IpfsKeychainMapper', () => {
  it('should map keychains to IPFS documents and back', async () => {
    const mapper = new IpfsKeychainMapper();
    const keychain = (await KeychainMother.create()).build();

    const document = mapper.toDocument(keychain);
    const restored = mapper.toDomain(document);

    expect(restored.toPrimitives()).toEqual(keychain.toPrimitives());
  });
});
