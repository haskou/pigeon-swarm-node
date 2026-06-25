import ActiveCallsFinder from '@app/contexts/calls/application/find-active-calls/ActiveCallsFinder';
import { ActiveCallsFindMessage } from '@app/contexts/calls/application/find-active-calls/messages/ActiveCallsFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CallsViewModel } from '../view-model/CallsViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallsRoute extends CallRouteSupport {
  private readonly finder = this.get<ActiveCallsFinder>(ActiveCallsFinder);

  @Get('/')
  public async getCalls(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const calls = await this.finder.find(
      new ActiveCallsFindMessage(requesterIdentityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallsViewModel(calls).toResource());
  }
}
