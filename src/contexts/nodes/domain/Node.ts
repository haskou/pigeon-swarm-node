import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { NodeCannotHaveMoreThanOnePublicNetworkError } from './errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeNetworkNotFoundError } from './errors/NodeNetworkNotFoundError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from './errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { NodeNetworkWasAdded } from './events/NodeNetworkWasAdded';
import { NodeNetworkWasRemoved } from './events/NodeNetworkWasRemoved';
import { NodeRelayConfigurationWasUpdated } from './events/NodeRelayConfigurationWasUpdated';
import { Network } from './Network';
import { NodeRelayConfiguration } from './NodeRelayConfiguration';

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
      NodeRelayConfiguration.fromPrimitives(primitives.relayConfiguration),
    );
  }

  constructor(
    private readonly id: NodeId,
    private readonly networks: Map<NetworkId, Network> = new Map(),
    private owner?: IdentityId,
    private relayConfiguration: NodeRelayConfiguration = NodeRelayConfiguration.default(),
  ) {
    super();
  }

  private hasMaximumOnePublicNetwork(): boolean {
    const publicNetworks = Array.from(this.networks.values()).filter(
      (network) => network.isPublic(),
    );

    return publicNetworks.length <= 1;
  }

  private findNetworkKey(networkId: NetworkId): NetworkId | undefined {
    return Array.from(this.networks.keys()).find((candidate) =>
      candidate.isEqual(networkId),
    );
  }

  public addNetwork(network: Network): void {
    this.networks.set(network.getId(), network);

    assert(
      this.hasMaximumOnePublicNetwork(),
      new NodeCannotHaveMoreThanOnePublicNetworkError(),
    );

    this.record(new NodeNetworkWasAdded(this.id.valueOf()));
  }

  public removeNetwork(networkId: NetworkId): void {
    const persistedNetworkId = this.findNetworkKey(networkId);

    assert(persistedNetworkId, new NodeNetworkNotFoundError(networkId));

    this.networks.delete(persistedNetworkId);
    this.record(
      new NodeNetworkWasRemoved(this.id.valueOf(), {
        networkId: networkId.valueOf(),
      }),
    );
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

  public updateRelayConfiguration(
    relayConfiguration: NodeRelayConfiguration,
  ): void {
    if (this.relayConfiguration.isEqual(relayConfiguration)) {
      return;
    }

    this.relayConfiguration = relayConfiguration;
    this.record(
      new NodeRelayConfigurationWasUpdated(this.id.valueOf(), {
        relayConfiguration: this.relayConfiguration.toPrimitives(),
      }),
    );
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

  public getId(): NodeId {
    return this.id;
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
      relayConfiguration: this.relayConfiguration.toPrimitives(),
    };
  }
}
