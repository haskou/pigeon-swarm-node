import { NodeRegistrationModeChangerMessage } from '@app/contexts/nodes/application/change-registration-mode/messages/NodeRegistrationModeChangerMessage';
import NodeRegistrationModeChanger from '@app/contexts/nodes/application/change-registration-mode/NodeRegistrationModeChanger';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNodeRegistrationBody } from '../bodies/PutNodeRegistrationBody';
import { NodeRegistrationViewModel } from '../view-model/NodeRegistrationViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/registration')
export class PutNodeRegistrationRoute extends NodeOwnerRouteSupport {
  private readonly changer = this.get<NodeRegistrationModeChanger>(
    NodeRegistrationModeChanger,
  );

  @Put('/')
  public async putRegistration(
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PutNodeRegistrationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const node = await this.changeNodeAsOwner(request, (identityId) =>
      this.changer.change(
        new NodeRegistrationModeChangerMessage(body.mode, identityId.valueOf()),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeRegistrationViewModel(node).toResource());
  }
}
