import { Keychain } from '@app/contexts/keychains/domain/Keychain';

import { IpfsKeychainDocument } from '../documents/IpfsKeychainDocument';

export default class IpfsKeychainMapper {
  public toDomain(document: IpfsKeychainDocument): Keychain {
    return Keychain.fromPrimitives({
      encryptedPayload: document.encryptedPayload,
      ownerIdentityId: document._id,
      previousKeychainExternalIdentifier: document.previousCid,
      signature: document.signature,
      timestamp: document.timestamp,
      version: document.version,
    });
  }

  public toDocument(keychain: Keychain): IpfsKeychainDocument {
    const primitives = keychain.toPrimitives();

    return {
      _id: primitives.ownerIdentityId,
      encryptedPayload: primitives.encryptedPayload,
      previousCid: primitives.previousKeychainExternalIdentifier,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };
  }
}
