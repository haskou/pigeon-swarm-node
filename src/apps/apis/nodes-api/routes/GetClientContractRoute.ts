import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { ClientContractViewModel } from '../view-model/ClientContractViewModel';

@JsonController('/client-contract')
export class GetClientContractRoute extends Route {
  @Get('/')
  public getClientContract(@Res() response: Response): Response {
    return response
      .status(HttpRouteStatusEnum.OK)
      .set('Cache-Control', 'no-store')
      .send(new ClientContractViewModel().toResource());
  }
}
