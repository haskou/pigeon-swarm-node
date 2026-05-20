import { PollCreateMessage } from '@app/contexts/polls/application/create/messages/PollCreateMessage';
import { PollCreator } from '@app/contexts/polls/application/create/PollCreator';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPollBody } from '../bodies/PostPollBody';
import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PostPollRoute extends PollRouteSupport {
  @Post('/')
  public async createPoll(
    @Body() body: PostPollBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const scopeAccess =
      body.scopeType === 'community_channel'
        ? await this.communityChannelScope(
            actor,
            body.communityId || '',
            body.channelId || '',
          )
        : await this.groupConversationScope(actor, body.conversationId || '');
    const poll = await new PollCreator(
      this.repository(),
      this.eventPublisher,
    ).create(
      new PollCreateMessage(
        actor.valueOf(),
        scopeAccess.scope,
        body.question,
        body.options,
        body.allowsMultipleVotes,
        scopeAccess.recipients,
        body.expiresAt,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(poll).toResource());
  }
}
