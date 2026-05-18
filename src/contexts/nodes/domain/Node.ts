import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { NodeCannotHaveMoreThanOnePublicNetworkError } from './errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from './errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { NodeNetworkWasAdded } from './events/NodeNetworkWasAdded';
import { Network } from './Network';

export class Node extends AggregateRoot {
  public static fromPrimitives(primitives: PrimitiveOf<Node>): Node {
    return new Node(
      new NodeId(primitives.id),
      new Map(
        Object.entries(primitives.networks).map(([key, network]) => [
          new NetworkId(key),
          Network.fromPrimitives(network),
        ]),
      ),
      primitives.owner ? new IdentityId(primitives.owner) : undefined,
    );
  }

  constructor(
    private readonly id: NodeId,
    private readonly networks: Map<NetworkId, Network> = new Map(),
    private owner?: IdentityId,
  ) {
    super();
  }

  private hasMaximumOnePublicNetwork(): boolean {
    const publicNetworks = Array.from(this.networks.values()).filter(
      (network) => network.isPublic(),
    );

    return publicNetworks.length <= 1;
  }

  public addNetwork(network: Network): void {
    this.networks.set(network.getId(), network);

    assert(
      this.hasMaximumOnePublicNetwork(),
      new NodeCannotHaveMoreThanOnePublicNetworkError(),
    );

    this.record(new NodeNetworkWasAdded(this.id.valueOf()));
  }

  public assignOwner(
    owner: IdentityId,
    authenticatedIdentityId: IdentityId,
  ): void {
    if (this.owner) {
      assert(
        this.isOwnedBy(authenticatedIdentityId),
        new NodeOwnerCanOnlyBeChangedByCurrentOwnerError(),
      );
    }

    this.owner = owner;
  }

  public hasOwner(): boolean {
    return this.owner !== undefined;
  }

  public isOwnedBy(identityId: IdentityId): boolean {
    return this.owner?.isEqual(identityId) ?? false;
  }

  public isIdentifiedBy(id: NodeId): boolean {
    return this.id.isEqual(id);
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      networks: Object.fromEntries(
        Array.from(this.networks.entries()).map(([networkId, network]) => [
          networkId.valueOf(),
          network.toPrimitives(),
        ]),
      ),
      owner: this.owner?.valueOf(),
    };
  }
}
