import { PollCreateMessage } from '@app/contexts/polls/application/create/messages/PollCreateMessage';
import { PollCreator } from '@app/contexts/polls/application/create/PollCreator';
import { PollTimelineMessageRegisterMessage } from '@app/contexts/polls/application/register-timeline-message/messages/PollTimelineMessageRegisterMessage';
import PollTimelineMessageRegistrar from '@app/contexts/polls/application/register-timeline-message/PollTimelineMessageRegistrar';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPollBody } from '../bodies/PostPollBody';
import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PostPollRoute extends PollRouteSupport {
  private readonly creator = this.get<PollCreator>(PollCreator);

  private readonly timelineRegistrar = this.get<PollTimelineMessageRegistrar>(
    PollTimelineMessageRegistrar,
  );

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
    const poll = await this.creator.create(
      new PollCreateMessage(
        actor.valueOf(),
        scopeAccess.scope,
        body.question,
        body.options,
        body.allowsMultipleVotes,
        scopeAccess.audience,
        body.expiresAt,
      ),
    );
    await this.timelineRegistrar.register(
      new PollTimelineMessageRegisterMessage(
        actor.valueOf(),
        poll,
        request.header('X-Signature') || '',
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(poll).toResource());
  }
}
