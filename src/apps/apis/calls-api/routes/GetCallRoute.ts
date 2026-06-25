import CallFinder from '@app/contexts/calls/application/find-call/CallFinder';
import { CallFindMessage } from '@app/contexts/calls/application/find-call/messages/CallFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallRoute extends CallRouteSupport {
  private readonly finder = this.get<CallFinder>(CallFinder);

  @Get('/:callId')
  public async getCall(
    @Param('callId') callId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const call = await this.finder.find(
      new CallFindMessage(callId, requesterIdentityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
