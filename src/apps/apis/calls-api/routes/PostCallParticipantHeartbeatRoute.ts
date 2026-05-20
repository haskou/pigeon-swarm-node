import { CallParticipantHeartbeatRecorder } from '@app/contexts/calls/application/record-participant-heartbeat/CallParticipantHeartbeatRecorder';
import { CallParticipantHeartbeatRecordMessage } from '@app/contexts/calls/application/record-participant-heartbeat/messages/CallParticipantHeartbeatRecordMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallParticipantHeartbeatRoute extends CallRouteSupport {
  @Post('/:callId/participants/me/heartbeat')
  public async heartbeat(
    @Param('callId') callId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const participantIdentityId = await this.authenticate(request);
    const call = await new CallParticipantHeartbeatRecorder(
      this.callRepository(),
    ).record(
      new CallParticipantHeartbeatRecordMessage(
        callId,
        participantIdentityId.valueOf(),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
