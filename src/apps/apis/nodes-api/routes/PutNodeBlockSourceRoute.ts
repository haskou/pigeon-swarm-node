import { NodeBlockSourceAdopterMessage } from '@app/contexts/nodes/application/adopt-block-source/messages/NodeBlockSourceAdopterMessage';
import NodeBlockSourceAdopter from '@app/contexts/nodes/application/adopt-block-source/NodeBlockSourceAdopter';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutNodeBlockSourceBody } from '../bodies/PutNodeBlockSourceBody';
import { NodeBlockSourceViewModel } from '../view-model/NodeBlockSourceViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/block-sources')
export class PutNodeBlockSourceRoute extends NodeOwnerRouteSupport {
  private readonly adopter = this.get<NodeBlockSourceAdopter>(
    NodeBlockSourceAdopter,
  );

  @Put('/:ownerIdentityId')
  public async putSource(
    @Param('ownerIdentityId') ownerIdentityId: string,
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PutNodeBlockSourceBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const source = await this.adopter.adopt(
      new NodeBlockSourceAdopterMessage(
        ownerIdentityId,
        body.origin,
        body.autoApply,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlockSourceViewModel(source).toResource());
  }
}
