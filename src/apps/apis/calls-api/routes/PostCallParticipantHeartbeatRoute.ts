import CallParticipantHeartbeatRecorder from '@app/contexts/calls/application/record-participant-heartbeat/CallParticipantHeartbeatRecorder';
import { CallParticipantHeartbeatRecordMessage } from '@app/contexts/calls/application/record-participant-heartbeat/messages/CallParticipantHeartbeatRecordMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCallParticipantHeartbeatBody } from '../bodies/PostCallParticipantHeartbeatBody';
import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallParticipantHeartbeatRoute extends CallRouteSupport {
  private readonly recorder = this.get<CallParticipantHeartbeatRecorder>(
    CallParticipantHeartbeatRecorder,
  );

  @Post('/:callId/participants/me/heartbeat')
  public async heartbeat(
    @Param('callId') callId: string,
    @Body({ options: { limit: '32kb' } })
    body: PostCallParticipantHeartbeatBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const participantIdentityId = await this.authenticate(request);
    const call = await this.recorder.record(
      new CallParticipantHeartbeatRecordMessage(
        callId,
        participantIdentityId.valueOf(),
        body.mediaConnections,
      ),
    );
    const leases = await this.findParticipantLeases([call]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call, leases).toResource());
  }
}
