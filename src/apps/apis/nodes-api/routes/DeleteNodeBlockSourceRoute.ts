import NodeBlockSourcesFinder from '@app/contexts/nodes/application/find-block-sources/NodeBlockSourcesFinder';
import { NodeBlockSourceRemoverMessage } from '@app/contexts/nodes/application/remove-block-source/messages/NodeBlockSourceRemoverMessage';
import NodeBlockSourceRemover from '@app/contexts/nodes/application/remove-block-source/NodeBlockSourceRemover';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { NodeBlockSourcesViewModel } from '../view-model/NodeBlockSourcesViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/block-sources')
export class DeleteNodeBlockSourceRoute extends NodeOwnerRouteSupport {
  private readonly remover = this.get<NodeBlockSourceRemover>(
    NodeBlockSourceRemover,
  );

  private readonly finder = this.get<NodeBlockSourcesFinder>(
    NodeBlockSourcesFinder,
  );

  @Delete('/:ownerIdentityId')
  public async deleteSource(
    @Param('ownerIdentityId') ownerIdentityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);
    await this.remover.remove(
      new NodeBlockSourceRemoverMessage(ownerIdentityId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NodeBlockSourcesViewModel(await this.finder.find()).toResource(),
      );
  }
}
