import CallParticipantHeartbeatRecorder from '@app/contexts/calls/application/record-participant-heartbeat/CallParticipantHeartbeatRecorder';
import { CallParticipantHeartbeatRecordMessage } from '@app/contexts/calls/application/record-participant-heartbeat/messages/CallParticipantHeartbeatRecordMessage';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchCallParticipantBody } from '../bodies/PatchCallParticipantBody';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PatchCallParticipantRoute extends CallRouteSupport {
  private readonly recorder = this.get<CallParticipantHeartbeatRecorder>(
    CallParticipantHeartbeatRecorder,
  );

  @Patch('/:callId/participants/me')
  public async heartbeat(
    @Param('callId') callId: string,
    @Body({ options: { limit: '32kb' } })
    body: PatchCallParticipantBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const participantIdentityId = await this.authenticate(request);
    await this.recorder.record(
      new CallParticipantHeartbeatRecordMessage(
        callId,
        participantIdentityId.valueOf(),
        body.mediaConnections,
        this.capability(request),
      ),
    );

    return response.status(204).send();
  }
}
