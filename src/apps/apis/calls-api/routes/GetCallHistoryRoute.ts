import CallHistoryFinder from '@app/contexts/calls/application/find-call-history/CallHistoryFinder';
import { CallHistoryFindMessage } from '@app/contexts/calls/application/find-call-history/messages/CallHistoryFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CallsViewModel } from '../view-model/CallsViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallHistoryRoute extends CallRouteSupport {
  private readonly finder = this.get<CallHistoryFinder>(CallHistoryFinder);

  @Get('/history')
  public async getCallHistory(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const calls = await this.finder.find(
      new CallHistoryFindMessage(requesterIdentityId.valueOf()),
    );
    const leases = await this.findParticipantLeases(calls);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallsViewModel(calls, leases).toResource());
  }
}
