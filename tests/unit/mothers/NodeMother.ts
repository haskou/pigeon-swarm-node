import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

export class NodeMother {
  public id: NodeId = NodeId.generate();
  public networks: Map<NetworkId, Network> = new Map();
  public owner?: IdentityId = undefined;
  public registrationMode: NodeRegistrationMode = NodeRegistrationMode.OPEN;

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

  public withRegistrationMode(registrationMode: NodeRegistrationMode): this {
    this.registrationMode = registrationMode;

    return this;
  }

  public build(): Node {
    return new Node(
      this.id,
      this.networks,
      this.owner,
      NodeRelayConfiguration.default(),
      this.registrationMode,
    );
  }
}
