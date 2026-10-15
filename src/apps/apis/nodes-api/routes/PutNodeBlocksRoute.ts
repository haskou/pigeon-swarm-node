import { NodeBlockListStorerMessage } from '@app/contexts/nodes/application/store-block-list/messages/NodeBlockListStorerMessage';
import NodeBlockListStorer from '@app/contexts/nodes/application/store-block-list/NodeBlockListStorer';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Put,
  Req,
  Res,
  UseBefore,
} from 'routing-controllers';

import { PutNodeBlocksBody } from '../bodies/PutNodeBlocksBody';
import { NodeBlockListUploadPreflight } from '../middlewares/NodeBlockListUploadPreflight';
import { NodeBlocksViewModel } from '../view-model/NodeBlocksViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/blocks')
export class PutNodeBlocksRoute extends NodeOwnerRouteSupport {
  private readonly storer: NodeBlockListStorer =
    this.get<NodeBlockListStorer>(NodeBlockListStorer);

  @Put('/')
  @UseBefore(NodeBlockListUploadPreflight)
  public async putBlocks(
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PutNodeBlocksBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const blockList = await this.storer.store(
      new NodeBlockListStorerMessage({
        blockedIdentityIds: body.blockedIdentityIds,
        blockedNodePeerIds: body.blockedNodePeerIds,
        identitySignature: body.identitySignature,
        issuedAt: body.issuedAt,
        ownerIdentityId: body.ownerIdentityId,
        type: body.type,
        version: body.version,
      }),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlocksViewModel(blockList).toResource());
  }
}
