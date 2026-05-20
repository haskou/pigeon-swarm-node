import { CallSignalSender } from '@app/contexts/calls/application/send-signal/CallSignalSender';
import { CallSignalSendMessage } from '@app/contexts/calls/application/send-signal/messages/CallSignalSendMessage';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCallSignalBody } from '../bodies/PostCallSignalBody';
import { CallSignalRateLimiter } from '../CallSignalRateLimiter';
import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallSignalRoute extends CallRouteSupport {
  @Post('/:callId/signals')
  public async sendSignal(
    @Param('callId') callId: string,
    @Body() body: PostCallSignalBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const senderIdentityId = await this.authenticate(request);

    await new CallSignalRateLimiter(this.get<MongoDB>(MongoDB)).consume(
      new CallId(callId),
      senderIdentityId,
    );
    const call = await new CallSignalSender(
      this.callRepository(),
      this.eventPublisher,
    ).send(
      new CallSignalSendMessage(
        callId,
        senderIdentityId.valueOf(),
        body.recipientIdentityId,
        body.signalType,
        body.payload,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
