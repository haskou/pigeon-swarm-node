import { Identity } from '@app/contexts/identities/domain/Identity';

import { IpfsIdentityDocument } from '../documents/IpfsIdentityDocument';

export default class IpfsIdentityMapper {
  public toDomain(document: IpfsIdentityDocument): Identity {
    return Identity.fromPrimitives({
      encryptedKeyPair: document.encryptedKeyPair,
      encryptedMasterKey: document.encryptedMasterKey,
      id: document._id,
      masterKeyDerivation: document.masterKeyDerivation,
      networks: document.networks,
      previousIdentityExternalIdentifier: document.previousCid,
      profile: document.profile,
      signature: document.signature,
      timestamp: document.timestamp,
      version: document.version,
    });
  }

  public toDocument(identity: Identity): IpfsIdentityDocument {
    const primitives = identity.toPrimitives();

    return {
      _id: primitives.id,
      encryptedKeyPair: primitives.encryptedKeyPair,
      encryptedMasterKey: primitives.encryptedMasterKey,
      masterKeyDerivation: primitives.masterKeyDerivation,
      networks: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      profile: primitives.profile,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };
  }
}
