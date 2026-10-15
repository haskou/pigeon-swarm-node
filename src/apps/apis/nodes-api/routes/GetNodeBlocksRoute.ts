import NodeBlockListFinder from '@app/contexts/nodes/application/find-block-list/NodeBlockListFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeBlocksViewModel } from '../view-model/NodeBlocksViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/blocks')
export class GetNodeBlocksRoute extends NodeOwnerRouteSupport {
  private readonly finder: NodeBlockListFinder =
    this.get<NodeBlockListFinder>(NodeBlockListFinder);

  @Get('/')
  public async getBlocks(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlocksViewModel(await this.finder.find()).toResource());
  }
}
