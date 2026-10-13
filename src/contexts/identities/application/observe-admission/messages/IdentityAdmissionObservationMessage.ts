import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

/**
 * A verified identity version seen replicating in, the networks this node
 * hosts among the ones it lists, and the version it updates when this node
 * knows it.
 */
export class IdentityAdmissionObservationMessage {
  public readonly externalIdentifier: IdentityExternalIdentifier;
  public readonly hostedNetworkIds: NetworkId[];

  constructor(
    public readonly identity: Identity,
    externalIdentifier: string,
    hostedNetworkIds: string[],
    public readonly previous?: Identity,
  ) {
    this.externalIdentifier = new IdentityExternalIdentifier(
      externalIdentifier,
    );
    this.hostedNetworkIds = hostedNetworkIds.map(
      (networkId) => new NetworkId(networkId),
    );
  }
}
