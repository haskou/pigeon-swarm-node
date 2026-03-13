import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityDocument } from '../documents/IdentityDocument';

export default class MongoIdentityMapper {
  public toDomain(document: IdentityDocument): Identity {
    return Identity.fromPrimitives({
      id: document._id,
      encryptedKeyPair: document.encryptedKeyPair,
      profile: document.profile,
      timestamp: document.timestamp,
      signature: document.signature,
    });
  }

  public toDocument(identity: Identity): IdentityDocument {
    const primitives = identity.toPrimitives();

    return {
      _id: primitives.id,
      encryptedKeyPair: primitives.encryptedKeyPair,
      profile: primitives.profile,
      timestamp: primitives.timestamp,
      signature: primitives.signature,
    };
  }
}
