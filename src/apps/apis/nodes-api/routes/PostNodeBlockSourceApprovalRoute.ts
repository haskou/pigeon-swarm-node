import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import { NodeBlockSourceEntriesApproverMessage } from '@app/contexts/nodes/application/approve-block-source-entries/messages/NodeBlockSourceEntriesApproverMessage';
import NodeBlockSourceEntriesApprover from '@app/contexts/nodes/application/approve-block-source-entries/NodeBlockSourceEntriesApprover';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostNodeBlockSourceApprovalBody } from '../bodies/PostNodeBlockSourceApprovalBody';
import { NodeBlockSourceViewModel } from '../view-model/NodeBlockSourceViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

/**
 * A source path or approved entry naming an identity id that is not the
 * canonical encoding of a key is refused (400080) before anything is stored.
 */
@JsonController('/node/block-sources')
export class PostNodeBlockSourceApprovalRoute extends NodeOwnerRouteSupport {
  private readonly approver = this.get<NodeBlockSourceEntriesApprover>(
    NodeBlockSourceEntriesApprover,
  );

  @Post('/:ownerIdentityId/approvals')
  public async postApproval(
    @Param('ownerIdentityId') ownerIdentityId: string,
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PostNodeBlockSourceApprovalBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const message = new NodeBlockSourceEntriesApproverMessage({
      all: body.all,
      blockedIdentityIds: body.blockedIdentityIds ?? [],
      blockedNodePeerIds: body.blockedNodePeerIds ?? [],
      ownerIdentityId,
      version: body.version,
    });

    if (
      ![
        message.ownerIdentityId,
        ...(message.entries?.getIdentityIds() ?? []),
      ].every((identityId) => identityId.isCanonicalKey())
    ) {
      throw new NonCanonicalIdentityIdError();
    }

    const source = await this.writeAsNodeOwner(request, () =>
      this.approver.approve(message),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlockSourceViewModel(source).toResource());
  }
}
