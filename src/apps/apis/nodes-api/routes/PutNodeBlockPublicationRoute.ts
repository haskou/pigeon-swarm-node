import { NodeBlockListPublicationUpdaterMessage } from '@app/contexts/nodes/application/update-block-list-publication/messages/NodeBlockListPublicationUpdaterMessage';
import NodeBlockListPublicationUpdater from '@app/contexts/nodes/application/update-block-list-publication/NodeBlockListPublicationUpdater';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNodeBlockPublicationBody } from '../bodies/PutNodeBlockPublicationBody';
import { NodeBlockPublicationViewModel } from '../view-model/NodeBlockPublicationViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/blocks/publication')
export class PutNodeBlockPublicationRoute extends NodeOwnerRouteSupport {
  private readonly updater = this.get<NodeBlockListPublicationUpdater>(
    NodeBlockListPublicationUpdater,
  );

  @Put('/')
  public async putPublication(
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PutNodeBlockPublicationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const publication = await this.updater.update(
      new NodeBlockListPublicationUpdaterMessage(body.published),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlockPublicationViewModel(publication).toResource());
  }
}
