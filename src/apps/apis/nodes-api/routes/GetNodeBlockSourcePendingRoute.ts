import { NodeBlockSourceFinderMessage } from '@app/contexts/nodes/application/find-block-source/messages/NodeBlockSourceFinderMessage';
import NodeBlockSourceFinder from '@app/contexts/nodes/application/find-block-source/NodeBlockSourceFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { NodeBlockSourcePendingViewModel } from '../view-model/NodeBlockSourcePendingViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/block-sources')
export class GetNodeBlockSourcePendingRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockSourceFinder>(
    NodeBlockSourceFinder,
  );

  @Get('/:ownerIdentityId/pending')
  public async getPending(
    @Param('ownerIdentityId') ownerIdentityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const source = await this.finder.find(
      new NodeBlockSourceFinderMessage(ownerIdentityId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlockSourcePendingViewModel(source).toResource());
  }
}
