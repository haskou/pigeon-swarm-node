import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';

@JsonController('/node/networks')
export class GetNodeNetworksRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  @Get('/')
  public async getNetworks(@Res() response: Response): Promise<Response> {
    const node = await this.loader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
