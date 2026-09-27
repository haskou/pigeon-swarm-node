import { Identity } from '@app/contexts/identities/domain/Identity';

import { IpfsIdentityDocument } from '../documents/IpfsIdentityDocument';

export default class IpfsIdentityMapper {
  public toDomain(document: IpfsIdentityDocument): Identity {
    return Identity.fromPrimitives({
      authorizationRevision: document.authorizationRevision,
      deviceCredentialCommitment: document.deviceCredentialCommitment,
      id: document._id,
      networks: document.networks,
      previousIdentityExternalIdentifier: document.previousCid,
      profile: document.profile,
      recoveryAuthority: document.recoveryAuthority,
      signature: document.signature,
      timestamp: document.timestamp,
      version: document.version,
    });
  }

  public toDocument(identity: Identity): IpfsIdentityDocument {
    const primitives = identity.toPrimitives();

    return {
      _id: primitives.id,
      authorizationRevision: primitives.authorizationRevision,
      deviceCredentialCommitment: primitives.deviceCredentialCommitment,
      networks: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      profile: primitives.profile,
      recoveryAuthority: primitives.recoveryAuthority,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };
  }
}
