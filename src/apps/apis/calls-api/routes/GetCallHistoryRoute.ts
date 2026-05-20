import { CallHistoryFinder } from '@app/contexts/calls/application/find-call-history/CallHistoryFinder';
import { CallHistoryFindMessage } from '@app/contexts/calls/application/find-call-history/messages/CallHistoryFindMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CallsViewModel } from '../view-model/CallsViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallHistoryRoute extends CallRouteSupport {
  @Get('/history')
  public async getCallHistory(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const calls = await new CallHistoryFinder(this.callRepository()).find(
      new CallHistoryFindMessage(requesterIdentityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallsViewModel(calls).toResource());
  }
}
