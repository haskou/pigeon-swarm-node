import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import { NodePeerNetwork } from '../../../domain/NodePeerNetwork';
import { NetworkName } from '../../../domain/value-objects/NetworkName';
import { NodePeerRegisterNetworkPayload } from './types/NodePeerRegisterNetworkPayload';

export class NodePeerRegisterMessage {
  public readonly lastSeenAt: Timestamp;
  public readonly networks: NodePeerNetwork[];
  public readonly nodeId: NodeId;
  public readonly owner: IdentityId | undefined;

  constructor(
    nodeId: string,
    owner: string | undefined,
    networks: NodePeerRegisterNetworkPayload[],
    lastSeenAt: number,
  ) {
    this.lastSeenAt = new Timestamp(lastSeenAt);
    this.networks = networks.map(
      (network) =>
        new NodePeerNetwork(
          new NetworkId(network.id),
          new NetworkName(network.name),
        ),
    );
    this.nodeId = new NodeId(nodeId);
    this.owner = owner ? new IdentityId(owner) : undefined;
  }
}
