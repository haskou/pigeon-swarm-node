import { PollCreateMessage } from '@app/contexts/polls/application/create/messages/PollCreateMessage';
import { PollCreator } from '@app/contexts/polls/application/create/PollCreator';
import { PollTimelineMessageRegisterMessage } from '@app/contexts/polls/application/register-timeline-message/messages/PollTimelineMessageRegisterMessage';
import PollTimelineMessageRegistrar from '@app/contexts/polls/application/register-timeline-message/PollTimelineMessageRegistrar';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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
        body.pollId,
        actor.valueOf(),
        scopeAccess.scope,
        {
          allowsMultipleVotes: body.allowsMultipleVotes,
          audience: scopeAccess.audience,
          expiresAt: body.expiresAt,
          options: body.options,
          question: body.question,
        },
        body.createdAt,
        body.mutation,
      ),
    );
    await this.timelineRegistrar.register(
      new PollTimelineMessageRegisterMessage(
        actor.valueOf(),
        poll,
        PublicMutationProof.fromPrimitives(body.timelineMutation),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(poll).toResource());
  }
}
