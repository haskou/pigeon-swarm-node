import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { PrimitiveOf } from '@haskou/value-objects';

import { NodeNetworkWasAdded } from './events/NodeNetworkWasAdded';
import { Network } from './Network';
import { NetworkName } from './value-objects/NetworkName';

export class Node extends AggregateRoot {
  public static fromPrimitives(primitives: PrimitiveOf<Node>): Node {
    return new Node(
      new NodeId(primitives.id),
      new Map(
        Object.entries(primitives.networks).map(([key, network]) => [
          new NetworkName(key),
          Network.fromPrimitives(network),
        ]),
      ),
      primitives.owner ? new IdentityId(primitives.owner) : undefined,
    );
  }

  constructor(
    private readonly id: NodeId,
    private readonly networks: Map<NetworkName, Network> = new Map(),
    private owner?: IdentityId,
  ) {
    super();
  }

  public addNetwork(network: Network): void {
    this.networks.set(network.getName(), network);
    this.record(new NodeNetworkWasAdded(this.id.valueOf()));
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      networks: Object.fromEntries(
        Array.from(this.networks.entries()).map(([key, network]) => [
          key.valueOf(),
          network.toPrimitives(),
        ]),
      ),
      owner: this.owner?.valueOf(),
    };
  }
}
