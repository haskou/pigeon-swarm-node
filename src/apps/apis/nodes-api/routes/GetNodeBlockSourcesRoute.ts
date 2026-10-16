import NodeBlockSourcesFinder from '@app/contexts/nodes/application/find-block-sources/NodeBlockSourcesFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeBlockSourcesViewModel } from '../view-model/NodeBlockSourcesViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/block-sources')
export class GetNodeBlockSourcesRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockSourcesFinder>(
    NodeBlockSourcesFinder,
  );

  @Get('/')
  public async getSources(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NodeBlockSourcesViewModel(await this.finder.find()).toResource(),
      );
  }
}
