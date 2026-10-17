import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import { NodeBlockSourceFinderMessage } from '@app/contexts/nodes/application/find-block-source/messages/NodeBlockSourceFinderMessage';
import NodeBlockSourceFinder from '@app/contexts/nodes/application/find-block-source/NodeBlockSourceFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { NodeBlockSourcePendingViewModel } from '../view-model/NodeBlockSourcePendingViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

/**
 * A path naming an identity id that is not the canonical encoding of a key is
 * refused (400080) once the owner is authenticated, before any source is read.
 */
@JsonController('/node/block-sources')
export class GetNodeBlockSourcePendingRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockSourceFinder>(
    NodeBlockSourceFinder,
  );

  @Get('/:ownerIdentityId/pending-entries')
  public async getPending(
    @Param('ownerIdentityId') ownerIdentityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const message = new NodeBlockSourceFinderMessage(ownerIdentityId);

    if (!message.ownerIdentityId.isCanonicalKey()) {
      throw new NonCanonicalIdentityIdError();
    }

    const source = await this.finder.find(message);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlockSourcePendingViewModel(source).toResource());
  }
}
