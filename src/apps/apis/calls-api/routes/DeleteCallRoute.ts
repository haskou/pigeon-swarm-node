import CallEnder from '@app/contexts/calls/application/end-call/CallEnder';
import { CallEndMessage } from '@app/contexts/calls/application/end-call/messages/CallEndMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class DeleteCallRoute extends CallRouteSupport {
  private readonly ender = this.get<CallEnder>(CallEnder);

  @Delete('/:callId')
  public async endCall(
    @Param('callId') callId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const participantIdentityId = await this.authenticate(request);
    const call = await this.ender.end(
      new CallEndMessage(callId, participantIdentityId.valueOf()),
    );
    const leases = await this.findParticipantLeases([call]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call, leases).toResource());
  }
}
