import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeRelayConfigurationViewModel } from '../view-model/NodeRelayConfigurationViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/relay-configuration')
export class GetNodeRelayConfigurationRoute extends NodeOwnerRouteSupport {
  @Get('/')
  public async getRelayConfiguration(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const node = await this.nodeLoader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeRelayConfigurationViewModel(node).toResource());
  }
}
