import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { MongoKeychainMetadataDocument } from '../documents/MongoKeychainMetadataDocument';

export default class MongoKeychainMetadataMapper {
  public toDocument(
    keychain: Keychain,
    cid: IPFSId,
    receivedAt: Timestamp = Timestamp.now(),
  ): MongoKeychainMetadataDocument {
    const primitives = keychain.toPrimitives();

    return {
      _id: `${primitives.ownerIdentityId}:${cid.valueOf()}`,
      cid: cid.valueOf(),
      keychain: {
        _id: primitives.ownerIdentityId,
        encryptedPayload: primitives.encryptedPayload,
        previousCid: primitives.previousKeychainExternalIdentifier,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      },
      ownerIdentityId: primitives.ownerIdentityId,
      previousCid: primitives.previousKeychainExternalIdentifier,
      receivedAt: receivedAt.valueOf(),
      version: primitives.version,
    };
  }
}
