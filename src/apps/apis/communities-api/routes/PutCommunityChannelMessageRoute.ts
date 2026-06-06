import { PutCommunityChannelMessageBody } from '@app/apps/apis/communities-api/bodies/PutCommunityChannelMessageBody';
import { CommunityChannelMessageMention } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMention';
import { CommunityChannelMessagePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelMessageAuthorMismatchError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageAuthorMismatchError';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageWasEditedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasEditedEvent';
import { CommunityChannelMessageSignatureDomainService } from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelAttachmentId } from '@app/contexts/communities/domain/value-objects/CommunityChannelAttachmentId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityMentionTargetId } from '@app/contexts/communities/domain/value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from '@app/contexts/communities/domain/value-objects/CommunityMentionType';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { assert, Signature, Timestamp } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PutCommunityChannelMessageRoute extends CommunityRouteSupport {
  private readonly signatureService =
    new CommunityChannelMessageSignatureDomainService();

  @Put('/:communityId/channels/:channelId/messages/:messageId')
  public async editMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: PutCommunityChannelMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);
    const targetMessageId = new CommunityChannelMessageId(messageId);
    const payload = CommunityChannelMessagePayload.fromPrimitives({
      encryptedPayload: body.encryptedPayload,
      plaintextPayload: body.plaintextPayload,
    });
    const targetMessage = await this.messageRepository().findById(
      new CommunityId(communityId),
      communityChannelId,
      targetMessageId,
    );

    assert(targetMessage, new CommunityChannelMessageNotFoundError());
    community.assertCanSendMessage(authorIdentityId, communityChannelId);
    community.assertCanUseMessagePayload(payload);
    assert(
      targetMessage.getAuthorIdentityId().isEqual(authorIdentityId),
      new CommunityChannelMessageAuthorMismatchError(),
    );

    const mentions = (body.mentions ?? []).map(
      (mention) =>
        new CommunityChannelMessageMention(
          new CommunityMentionType(mention.type),
          mention.targetId
            ? new CommunityMentionTargetId(mention.targetId)
            : undefined,
        ),
    );

    community.assertCanMention(authorIdentityId, mentions);
    const mentionPrimitives = mentions.map((mention) => mention.toPrimitives());

    this.signatureService.assertValidSignature(
      authorIdentityId,
      {
        attachmentExternalIdentifiers: body.attachmentExternalIdentifiers ?? [],
        authorIdentityId: authorIdentityId.valueOf(),
        channelId,
        communityId,
        createdAt: body.createdAt,
        encryptedPayload: body.encryptedPayload,
        id: messageId,
        mentions: mentionPrimitives,
        plaintextPayload: body.plaintextPayload,
        type: 'edited',
      },
      new Signature(body.signature),
    );

    const message = targetMessage.edit(
      payload,
      new Signature(body.signature),
      new Timestamp(body.createdAt),
      (body.attachmentExternalIdentifiers ?? []).map(
        (externalIdentifier) =>
          new CommunityChannelAttachmentId(externalIdentifier),
      ),
      mentions,
    );

    await this.messageRepository().save(message);
    const communityPrimitives = community.toPrimitives();
    const messagePrimitives = message.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasEditedEvent(communityId, {
        authorIdentityId: authorIdentityId.valueOf(),
        channelId,
        community: communityPrimitives,
        communityId,
        memberIds: communityPrimitives.memberIds,
        message: messagePrimitives,
        messageId,
        networkId: communityPrimitives.networkId,
      }),
    ]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityChannelMessageViewModel(message).toResource());
  }
}
