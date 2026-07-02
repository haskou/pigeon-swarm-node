import NodePeersFinder from '@app/contexts/nodes/application/find-peers/NodePeersFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { PeersViewModel } from '../view-model/PeersViewModel';

@JsonController('/peers')
export class GetPeersRoute extends Route {
  private readonly finder: NodePeersFinder =
    this.get<NodePeersFinder>(NodePeersFinder);

  @Get('/')
  public async getPeers(@Res() response: Response): Promise<Response> {
    const activePeers = await this.finder.findActive();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PeersViewModel(activePeers).toResource());
  }
}
