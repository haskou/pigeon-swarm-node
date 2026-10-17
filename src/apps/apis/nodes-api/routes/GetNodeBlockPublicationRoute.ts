import NodeBlockListPublicationFinder from '@app/contexts/nodes/application/find-block-list-publication/NodeBlockListPublicationFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeBlockPublicationViewModel } from '../view-model/NodeBlockPublicationViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/blocks/publication')
export class GetNodeBlockPublicationRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockListPublicationFinder>(
    NodeBlockListPublicationFinder,
  );

  @Get()
  public async getPublication(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NodeBlockPublicationViewModel(
          await this.finder.find(),
        ).toResource(),
      );
  }
}
