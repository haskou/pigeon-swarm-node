import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import { PageRequest } from '@app/apps/apis/shared/pagination/PageRequest';
import { NodeBlockSourceFinderMessage } from '@app/contexts/nodes/application/find-block-source/messages/NodeBlockSourceFinderMessage';
import NodeBlockSourceFinder from '@app/contexts/nodes/application/find-block-source/NodeBlockSourceFinder';
import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { NodeListPositions } from '../requests/NodeListPositions';
import { NodeBlockSourcePendingViewModel } from '../view-model/NodeBlockSourcePendingViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

/**
 * A path naming an identity id that is not the canonical encoding of a key is
 * refused (400080) once the owner is authenticated, before any source is read.
 * Each of the two blocked lists is paged by its own cursor and limit.
 */
@JsonController('/node/block-sources')
export class GetNodeBlockSourcePendingRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockSourceFinder>(
    NodeBlockSourceFinder,
  );

  @Get('/:ownerIdentityId/pending-entries')
  public async getPending(
    @Param('ownerIdentityId') ownerIdentityId: string,
    @QueryParam('blockedIdentityIdsLimit')
    blockedIdentityIdsLimit: string | undefined,
    @QueryParam('blockedIdentityIdsCursor')
    blockedIdentityIdsCursor: string | undefined,
    @QueryParam('blockedNodePeerIdsLimit')
    blockedNodePeerIdsLimit: string | undefined,
    @QueryParam('blockedNodePeerIdsCursor')
    blockedNodePeerIdsCursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const message = new NodeBlockSourceFinderMessage(ownerIdentityId);

    if (!message.ownerIdentityId.isCanonicalKey()) {
      throw new NonCanonicalIdentityIdError();
    }

    const identities = new PageRequest(
      'block-source-identities',
      blockedIdentityIdsLimit,
      blockedIdentityIdsCursor,
      NodeListPositions.identityId,
    );
    const nodePeers = new PageRequest(
      'block-source-node-peers',
      blockedNodePeerIdsLimit,
      blockedNodePeerIdsCursor,
      NodeListPositions.nodePeerId,
    );
    const identityAfter = identities.getAfterPosition();
    const nodePeerAfter = nodePeers.getAfterPosition();

    const source = await this.finder.find(message);
    const pending = new NodeBlockSourcePendingViewModel(source).toResource();
    const identityPage = PageSlice.of({
      after: identityAfter,
      items: pending.blockedIdentityIds,
      limit: identities.getLimit(),
      order: 'asc',
      position: (identityId) => identityId,
    });
    const nodePeerPage = PageSlice.of({
      after: nodePeerAfter,
      items: pending.blockedNodePeerIds,
      limit: nodePeers.getLimit(),
      order: 'asc',
      position: (nodePeerId) => nodePeerId,
    });

    return response.status(HttpRouteStatusEnum.OK).send({
      blockedIdentityIds: identityPage.items,
      blockedIdentityIdsNextCursor: identities.nextCursor(
        identityPage.nextPosition,
      ),
      blockedNodePeerIds: nodePeerPage.items,
      blockedNodePeerIdsNextCursor: nodePeers.nextCursor(
        nodePeerPage.nextPosition,
      ),
      ownerIdentityId: pending.ownerIdentityId,
      version: pending.version,
    });
  }
}
