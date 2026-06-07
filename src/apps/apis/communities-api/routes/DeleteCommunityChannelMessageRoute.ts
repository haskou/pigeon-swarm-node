import { DeleteCommunityChannelMessageBody } from '@app/apps/apis/communities-api/bodies/DeleteCommunityChannelMessageBody';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasDeletedEvent';
import { CommunityChannelMessageSignatureDomainService } from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { assert, Signature } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { DeletedCommunityChannelMessageViewModel } from '../view-model/DeletedCommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelMessageRoute extends CommunityRouteSupport {
  private readonly signatureService =
    new CommunityChannelMessageSignatureDomainService();

  @Delete('/:communityId/channels/:channelId/messages/:messageId')
  public async deleteMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: DeleteCommunityChannelMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const targetMessageId = new CommunityChannelMessageId(messageId);
    const targetMessage = await this.messageRepository().findById(
      new CommunityId(communityId),
      communityChannelId,
      targetMessageId,
    );

    assert(targetMessage, new CommunityChannelMessageNotFoundError());
    community.assertCanDeleteMessage(
      actorIdentityId,
      targetMessage.getAuthorIdentityId(),
      communityChannelId,
    );

    this.signatureService.assertValidSignature(
      actorIdentityId,
      {
        actorIdentityId: actorIdentityId.valueOf(),
        channelId,
        communityId,
        createdAt: body.createdAt,
        id: body.id,
        targetMessageId: messageId,
        type: 'deleted',
      },
      new Signature(body.signature),
    );

    await this.messageRepository().delete(
      new CommunityId(communityId),
      communityChannelId,
      targetMessageId,
    );
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasDeletedEvent(communityId, {
        channelId,
        community: communityPrimitives,
        communityId,
        createdAt: body.createdAt,
        deletedByIdentityId: actorIdentityId.valueOf(),
        memberIds: communityPrimitives.memberIds,
        messageId: body.id,
        networkId: communityPrimitives.networkId,
        signature: body.signature,
        targetMessageAuthorId: targetMessage.toPrimitives().authorIdentityId,
        targetMessageId: messageId,
      }),
    ]);
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.MESSAGE_DELETED,
      this.moderationTarget(
        CommunityModerationTargetType.MESSAGE,
        targetMessageId,
      ),
      {
        channelId,
        targetMessageAuthorId: targetMessage.toPrimitives().authorIdentityId,
      },
    );

    return response.status(HttpRouteStatusEnum.OK).send(
      new DeletedCommunityChannelMessageViewModel({
        channelId,
        communityId,
        deletedByIdentityId: actorIdentityId.valueOf(),
        id: body.id,
        targetMessageId: messageId,
        type: 'deleted',
      }).toResource(),
    );
  }
}
