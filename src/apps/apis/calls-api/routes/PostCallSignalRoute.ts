import CallSignalSender from '@app/contexts/calls/application/send-signal/CallSignalSender';
import { CallSignalSendMessage } from '@app/contexts/calls/application/send-signal/messages/CallSignalSendMessage';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
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

import { PostCallSignalBody } from '../bodies/PostCallSignalBody';
import CallSignalRateLimiter from '../CallSignalRateLimiter';
import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallSignalRoute extends CallRouteSupport {
  private readonly sender = this.get<CallSignalSender>(CallSignalSender);

  private readonly rateLimiter = this.get<CallSignalRateLimiter>(
    CallSignalRateLimiter,
  );

  @Post('/:callId/signals')
  public async sendSignal(
    @Param('callId') callId: string,
    @Body() body: PostCallSignalBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const senderIdentityId = await this.authenticate(request);
    const call = await this.sender.send(
      new CallSignalSendMessage(
        callId,
        senderIdentityId.valueOf(),
        body.recipientIdentityId,
        body.signalType,
        body.payload,
      ),
      async () => {
        await this.rateLimiter.consume(new CallId(callId), senderIdentityId);
      },
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
