import { Identity } from '@app/contexts/identities/domain/Identity';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { MongoIdentityMetadataDocument } from '../documents/MongoIdentityMetadataDocument';

export default class MongoIdentityMetadataMapper {
  public toDocument(
    identity: Identity,
    cid: IPFSId,
    receivedAt: Timestamp = Timestamp.now(),
  ): MongoIdentityMetadataDocument {
    const primitives = identity.toPrimitives();

    return {
      _id: `${primitives.id}:${cid.valueOf()}`,
      cid: cid.valueOf(),
      handle: primitives.profile.handle,
      identity: {
        _id: primitives.id,
        encryptedKeyPair: primitives.encryptedKeyPair,
        networks: primitives.networks,
        previousCid: primitives.previousIdentityExternalIdentifier,
        profile: primitives.profile,
        signature: primitives.signature,
        timestamp: primitives.timestamp,
        version: primitives.version,
      },
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      receivedAt: receivedAt.valueOf(),
      version: primitives.version,
    };
  }
}
