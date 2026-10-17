import { Network } from '@app/contexts/nodes/domain/Network';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeNetworkAdderMessage {
  public readonly network: Network;
  /** Undefined while nobody claimed the node. */
  public readonly authenticatedIdentityId?: IdentityId;

  constructor(
    id: string,
    name: string,
    key: string | undefined,
    authenticatedIdentityId: string | undefined,
  ) {
    this.network = Network.fromPrimitives({
      id,
      key,
      name,
    });
    this.authenticatedIdentityId =
      authenticatedIdentityId === undefined
        ? undefined
        : new IdentityId(authenticatedIdentityId);
  }
}
