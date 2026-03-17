import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

export class NodeMother {
  public id: NodeId = new NodeId('b4ce3ab9-c709-4d3a-af0a-84fefe52f0d7');

  public networks: Map<NetworkId, Network> = new Map();
  public owner?: IdentityId = undefined;

  public withId(id: NodeId): this {
    this.id = id;

    return this;
  }

  public withNetwork(networkId: NetworkId, network: Network): this {
    this.networks.set(networkId, network);

    return this;
  }

  public withOwner(owner: IdentityId): this {
    this.owner = owner;

    return this;
  }

  public build(): Node {
    return Node.fromPrimitives({
      id: this.id.valueOf(),
      networks: Object.fromEntries(
        Array.from(this.networks.entries()).map(([networkId, network]) => [
          networkId.valueOf(),
          network.toPrimitives(),
        ]),
      ),
      owner: this.owner?.valueOf(),
    });
  }
}
