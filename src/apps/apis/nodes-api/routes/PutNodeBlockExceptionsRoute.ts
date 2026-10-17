import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import { NodeBlockExceptionsUpdaterMessage } from '@app/contexts/nodes/application/update-block-exceptions/messages/NodeBlockExceptionsUpdaterMessage';
import NodeBlockExceptionsUpdater from '@app/contexts/nodes/application/update-block-exceptions/NodeBlockExceptionsUpdater';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNodeBlockExceptionsBody } from '../bodies/PutNodeBlockExceptionsBody';
import { NodeBlockExceptionsViewModel } from '../view-model/NodeBlockExceptionsViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

/**
 * Exceptions naming an identity id that is not the canonical encoding of a
 * key are refused (400080) before anything is stored.
 */
@JsonController('/node/block-exceptions')
export class PutNodeBlockExceptionsRoute extends NodeOwnerRouteSupport {
  private readonly updater = this.get<NodeBlockExceptionsUpdater>(
    NodeBlockExceptionsUpdater,
  );

  @Put('/')
  public async putExceptions(
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PutNodeBlockExceptionsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const message = new NodeBlockExceptionsUpdaterMessage(
      body.identityIds,
      body.nodePeerIds,
    );

    if (
      !message.exceptions
        .getIdentityIds()
        .every((identityId) => identityId.isCanonicalKey())
    ) {
      throw new NonCanonicalIdentityIdError();
    }

    const exceptions = await this.updater.update(message);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlockExceptionsViewModel(exceptions).toResource());
  }
}
