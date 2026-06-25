import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { NodeViewModel } from '../view-model/NodeViewModel';

@JsonController('/node')
export class GetNodeRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  @Get('/')
  public async getNode(@Res() response: Response): Promise<Response> {
    const node = await this.loader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeViewModel(node).toResource());
  }
}
