import { Identity } from '@app/contexts/identities/domain/Identity';

import { IdentityDocument } from '../documents/IdentityDocument';

export default class MongoIdentityMapper {
  public toDomain(document: IdentityDocument): Identity {
    return Identity.fromPrimitives({
      encryptedKeyPair: document.encryptedKeyPair,
      id: document._id,
      profile: document.profile,
      signature: document.signature,
      timestamp: document.timestamp,
    });
  }

  public toDocument(identity: Identity): IdentityDocument {
    const primitives = identity.toPrimitives();

    return {
      _id: primitives.id,
      encryptedKeyPair: primitives.encryptedKeyPair,
      profile: primitives.profile,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
    };
  }
}
