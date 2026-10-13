import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';

/** A verified identity version seen replicating in, with the version it updates when this node knows it. */
export class IdentityAdmissionObservationMessage {
  public readonly externalIdentifier: IdentityExternalIdentifier;

  constructor(
    public readonly identity: Identity,
    externalIdentifier: string,
    public readonly previous?: Identity,
  ) {
    this.externalIdentifier = new IdentityExternalIdentifier(
      externalIdentifier,
    );
  }
}
