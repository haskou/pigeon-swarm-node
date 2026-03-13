import { Identity } from '@app/contexts/identities/domain/Identity';

import { HeliaIdentityDocument } from '../documents/HeliaIdentityDocument';

export default class HeliaIdentityMapper {
  public toDomain(document: HeliaIdentityDocument): Identity {
    return Identity.fromPrimitives({
      encryptedKeyPair: document.encryptedKeyPair,
      id: document._id,
      profile: document.profile,
      signature: document.signature,
      timestamp: document.timestamp,
    });
  }

  public toDocument(identity: Identity): HeliaIdentityDocument {
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
