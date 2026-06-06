import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageMetadata } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMetadata';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { PollCreateMessage } from '@app/contexts/polls/application/create/messages/PollCreateMessage';
import { PollCreator } from '@app/contexts/polls/application/create/PollCreator';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Signature, Timestamp } from '@haskou/value-objects';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPollBody } from '../bodies/PostPollBody';
import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PostPollRoute extends PollRouteSupport {
  private async registerConversationTimelineMessage(
    actor: IdentityId,
    poll: Poll,
    scope: PollScope,
    request: Request,
  ): Promise<void> {
    const conversationId = scope.getConversationId();

    if (!conversationId) {
      return;
    }
    const conversation =
      await this.conversationRepository().findById(conversationId);

    if (!conversation) {
      return;
    }
    conversation.addPollMessage(
      actor,
      poll.getId(),
      new Signature(request.header('X-Signature') || ''),
      {
        createdAt: new Timestamp(poll.toPrimitives().createdAt),
      },
    );
    await this.conversationRepository().save(conversation);
  }

  private async registerCommunityChannelTimelineMessage(
    actor: IdentityId,
    poll: Poll,
    scope: PollScope,
  ): Promise<void> {
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();

    if (!communityId || !channelId) {
      return;
    }
    await this.communityMessageRepository().save(
      CommunityChannelMessage.poll(
        new CommunityChannelMessageMetadata(
          new CommunityChannelMessageId(poll.getId().valueOf()),
          communityId,
          channelId,
          actor,
          new Timestamp(poll.toPrimitives().createdAt),
        ),
        poll.getId(),
      ),
    );
  }

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
    await this.registerConversationTimelineMessage(
      actor,
      poll,
      scopeAccess.scope,
      request,
    );
    await this.registerCommunityChannelTimelineMessage(
      actor,
      poll,
      scopeAccess.scope,
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(poll).toResource());
  }
}
