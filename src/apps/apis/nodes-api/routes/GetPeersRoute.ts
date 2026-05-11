import NodePeersFinder from '@app/contexts/nodes/application/find-peers/NodePeersFinder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { PeersViewModel } from '../view-model/PeersViewModel';

@JsonController('/peers')
export class GetPeersRoute extends Route {
  private readonly finder: NodePeersFinder =
    this.get<NodePeersFinder>(NodePeersFinder);

  @Get('/')
  public async getPeers(@Res() response: Response): Promise<Response> {
    const peers = await this.finder.findActive();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PeersViewModel(peers).toResource());
  }
}
