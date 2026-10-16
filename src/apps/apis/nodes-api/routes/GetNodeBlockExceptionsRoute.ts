import NodeBlockExceptionsFinder from '@app/contexts/nodes/application/find-block-exceptions/NodeBlockExceptionsFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeBlockExceptionsViewModel } from '../view-model/NodeBlockExceptionsViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/block-exceptions')
export class GetNodeBlockExceptionsRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockExceptionsFinder>(
    NodeBlockExceptionsFinder,
  );

  @Get('/')
  public async getExceptions(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NodeBlockExceptionsViewModel(await this.finder.find()).toResource(),
      );
  }
}
