import type { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';

import NodePeersFinder from '@app/contexts/nodes/application/find-peers/NodePeersFinder';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import type { ConnectedIpfsPeerResource } from '../resources/ConnectedIpfsPeerResource';

import { PeersViewModel } from '../view-model/PeersViewModel';

@JsonController('/peers')
export class GetPeersRoute extends Route {
  private readonly finder: NodePeersFinder =
    this.get<NodePeersFinder>(NodePeersFinder);

  private readonly networkRegistry: IPFSNetworkRegistry =
    this.get<IPFSNetworkRegistry>(IPFSNetworkRegistry);

  private addConnectedIpfsPeerNetwork(
    peers: Map<string, ConnectedIpfsPeerResource>,
    peerId: string,
    network: IPFSNetwork,
  ): void {
    const current = peers.get(peerId) ?? {
      id: peerId,
      networks: [],
    };

    if (
      !current.networks.some(
        (peerNetwork) => peerNetwork.id === network.getId(),
      )
    ) {
      current.networks.push({
        id: network.getId(),
        name: network.getName(),
        type: network.getType(),
      });
    }

    peers.set(peerId, current);
  }

  private connectedIpfsPeers(): ConnectedIpfsPeerResource[] {
    const peers = new Map<string, ConnectedIpfsPeerResource>();

    for (const network of this.networkRegistry.getAll()) {
      for (const peerId of network.getPeers()) {
        this.addConnectedIpfsPeerNetwork(peers, peerId, network);
      }
    }

    return [...peers.values()];
  }

  @Get('/')
  public async getPeers(@Res() response: Response): Promise<Response> {
    const activePeers = await this.finder.findActive();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new PeersViewModel(activePeers, this.connectedIpfsPeers()).toResource(),
      );
  }
}
