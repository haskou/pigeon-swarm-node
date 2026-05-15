import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CallsViewModel } from '../view-model/CallsViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallsRoute extends CallRouteSupport {
  @Get('/')
  public async getCalls(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const calls =
      await this.callRepository().findActiveByParticipant(requesterIdentityId);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallsViewModel(calls).toResource());
  }
}
