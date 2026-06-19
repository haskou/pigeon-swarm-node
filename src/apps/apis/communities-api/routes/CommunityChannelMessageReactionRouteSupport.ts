import { CommunityChannelMessageReactionBody } from '@app/apps/apis/communities-api/bodies/CommunityChannelMessageReactionBody';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { assert } from '@haskou/value-objects';
import { Request } from 'express';

import { CommunityRouteSupport } from './CommunityRouteSupport';

// eslint-disable-next-line max-len
export abstract class CommunityChannelMessageReactionRouteSupport extends CommunityRouteSupport {
  protected async persistReaction(
    communityId: string,
    channelId: string,
    messageId: string,
    body: CommunityChannelMessageReactionBody,
    request: Request,
  ): Promise<CommunityChannelMessageReaction> {
    const reaction = await this.buildReaction(
      communityId,
      channelId,
      messageId,
      body,
      request,
    );

    await this.reactions().save(reaction);

    return reaction;
  }

  protected async buildReaction(
    communityId: string,
    channelId: string,
    messageId: string,
    body: CommunityChannelMessageReactionBody,
    request: Request,
  ): Promise<CommunityChannelMessageReaction> {
    const authorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const communityMessageId = new CommunityChannelMessageId(messageId);

    assert(
      await this.messageRepository().findById(
        new CommunityId(communityId),
        communityChannelId,
        communityMessageId,
      ),
      new CommunityChannelMessageNotFoundError(),
    );

    return community.reactWithSticker(
      authorIdentityId,
      communityChannelId,
      communityMessageId,
      new CommunityChannelMessageReactionEmoji(body.emoji),
    );
  }
}
