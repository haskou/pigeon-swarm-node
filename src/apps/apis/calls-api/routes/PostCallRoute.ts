import { CallScopeResolver } from '@app/contexts/calls/application/start-call/CallScopeResolver';
import { CallStarter } from '@app/contexts/calls/application/start-call/CallStarter';
import { CallStartMessage } from '@app/contexts/calls/application/start-call/messages/CallStartMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostCallBody } from '../bodies/PostCallBody';
import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallRoute extends CallRouteSupport {
  @Post('/')
  public async startCall(
    @Body() body: PostCallBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const creatorIdentityId = await this.authenticate(request);
    const call = await new CallStarter(
      this.callRepository(),
      new CallScopeResolver(
        this.conversationRepository(),
        this.communityRepository(),
      ),
      this.eventPublisher,
    ).start(
      new CallStartMessage(
        creatorIdentityId.valueOf(),
        body.scopeType,
        body.conversationId,
        body.communityId,
        body.channelId,
        body.invitedParticipantIds,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
