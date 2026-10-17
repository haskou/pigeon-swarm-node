import NodeRegistrationCodesFinder from '@app/contexts/nodes/application/find-registration-codes/NodeRegistrationCodesFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeRegistrationCodesViewModel } from '../view-model/NodeRegistrationCodesViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/registration-codes')
export class GetNodeRegistrationCodesRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeRegistrationCodesFinder>(
    NodeRegistrationCodesFinder,
  );

  @Get()
  public async getRegistrationCodes(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const codes = await this.finder.find();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeRegistrationCodesViewModel(codes).toResource());
  }
}
