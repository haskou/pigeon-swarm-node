import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallSignalType } from '@app/contexts/calls/domain/value-objects/CallSignalType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
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
    const call = await this.findCall(callId);

    await new CallSignalRateLimiter(this.get<MongoDB>(MongoDB)).consume(
      new CallId(callId),
      senderIdentityId,
    );
    call.sendSignal(
      senderIdentityId,
      new IdentityId(body.recipientIdentityId),
      new CallSignalType(body.signalType),
      body.payload,
    );
    await this.eventPublisher.publish(call.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
