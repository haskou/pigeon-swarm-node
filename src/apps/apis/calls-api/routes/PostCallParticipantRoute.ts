import CallJoiner from '@app/contexts/calls/application/join-call/CallJoiner';
import { CallJoinMessage } from '@app/contexts/calls/application/join-call/messages/CallJoinMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallParticipantRoute extends CallRouteSupport {
  private readonly joiner = this.get<CallJoiner>(CallJoiner);

  @Post('/:callId/participants')
  public async joinCall(
    @Param('callId') callId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const participantIdentityId = await this.authenticate(request);
    const call = await this.joiner.join(
      new CallJoinMessage(callId, participantIdentityId.valueOf()),
    );
    const leases = await this.findParticipantLeases([call]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call, leases).toResource());
  }
}
