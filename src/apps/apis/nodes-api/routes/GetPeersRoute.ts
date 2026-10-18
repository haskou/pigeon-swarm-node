import { PageRequest } from '@app/apps/apis/shared/pagination/PageRequest';
import NodeNetworkSynchronizationFinder from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationFinder';
import NodePeersFinder from '@app/contexts/nodes/application/find-peers/NodePeersFinder';
import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, QueryParam, Res } from 'routing-controllers';

import { NodeListPositions } from '../requests/NodeListPositions';
import { PeersViewModel } from '../view-model/PeersViewModel';

/**
 * Both peer arrays are paged, each by its own cursor and limit. The network
 * synchronization status is a single object and is returned whole.
 */
@JsonController('/peers')
export class GetPeersRoute extends Route {
  private readonly peersFinder: NodePeersFinder =
    this.get<NodePeersFinder>(NodePeersFinder);

  private readonly synchronizationFinder: NodeNetworkSynchronizationFinder =
    this.get<NodeNetworkSynchronizationFinder>(
      NodeNetworkSynchronizationFinder,
    );

  @Get()
  public async getPeers(
    @QueryParam('peersLimit') peersLimit: string | undefined,
    @QueryParam('peersCursor') peersCursor: string | undefined,
    @QueryParam('ipfsPeersLimit') ipfsPeersLimit: string | undefined,
    @QueryParam('ipfsPeersCursor') ipfsPeersCursor: string | undefined,
    @Res() response: Response,
  ): Promise<Response> {
    const peers = new PageRequest(
      'peers',
      peersLimit,
      peersCursor,
      NodeListPositions.nodeId,
    );
    const ipfsPeers = new PageRequest(
      'ipfs-peers',
      ipfsPeersLimit,
      ipfsPeersCursor,
      NodeListPositions.nodePeerId,
    );
    const peersAfter = peers.getAfterPosition();
    const ipfsPeersAfter = ipfsPeers.getAfterPosition();

    const resource = new PeersViewModel(
      await this.peersFinder.find(),
      this.synchronizationFinder.find(),
    ).toResource();
    const peersPage = PageSlice.of({
      after: peersAfter,
      items: resource.peers,
      limit: peers.getLimit(),
      order: 'asc',
      position: (peer) => peer.id,
    });
    const ipfsPeersPage = PageSlice.of({
      after: ipfsPeersAfter,
      items: resource.ipfsPeers,
      limit: ipfsPeers.getLimit(),
      order: 'asc',
      position: (peer) => peer.id,
    });

    return response.status(HttpRouteStatusEnum.OK).send({
      ipfsPeers: ipfsPeersPage.items,
      ipfsPeersNextCursor: ipfsPeers.nextCursor(ipfsPeersPage.nextPosition),
      networkSynchronization: resource.networkSynchronization,
      peers: peersPage.items,
      peersNextCursor: peers.nextCursor(peersPage.nextPosition),
    });
  }
}
