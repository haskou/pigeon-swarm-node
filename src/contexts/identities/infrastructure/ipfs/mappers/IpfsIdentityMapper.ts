import { Identity } from '@app/contexts/identities/domain/Identity';

import { IpfsIdentityDocument } from '../documents/IpfsIdentityDocument';

export default class IpfsIdentityMapper {
  public toDomain(document: IpfsIdentityDocument): Identity {
    return Identity.fromPrimitives({
      encryptedKeyPair: document.encryptedKeyPair,
      id: document._id,
      networks: document.networks,
      profile: document.profile,
      signature: document.signature,
      timestamp: document.timestamp,
    });
  }

  public toDocument(identity: Identity): IpfsIdentityDocument {
    const primitives = identity.toPrimitives();

    return {
      _id: primitives.id,
      encryptedKeyPair: primitives.encryptedKeyPair,
      networks: primitives.networks,
      profile: primitives.profile,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
    };
  }
}
