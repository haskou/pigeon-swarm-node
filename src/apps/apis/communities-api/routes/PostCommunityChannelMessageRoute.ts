import { PostCommunityChannelMessageBody } from '@app/apps/apis/communities-api/bodies/PostCommunityChannelMessageBody';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageMetadata } from '@app/contexts/communities/domain/CommunityChannelMessageMetadata';
import { InvalidCommunityChannelMessageSignatureError } from '@app/contexts/communities/domain/errors/InvalidCommunityChannelMessageSignatureError';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import { CommunityChannelMessageSignatureDomainService } from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelAttachmentId } from '@app/contexts/communities/domain/value-objects/CommunityChannelAttachmentId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageEncryptedPayload } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { PublicKey, Signature, Timestamp } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityChannelMessageRoute extends CommunityRouteSupport {
  private readonly signatureService =
    new CommunityChannelMessageSignatureDomainService();

  private readonly eventPublisher = this.get<MessageBus>(MessageBus);

  @Post('/:communityId/channels/:channelId/messages')
  public async sendMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PostCommunityChannelMessageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const communityChannelId = new CommunityChannelId(channelId);

    community.assertIsMember(authorIdentityId);
    community.assertHasTextChannel(communityChannelId);

    const message = CommunityChannelMessage.create(
      new CommunityChannelMessageMetadata(
        new CommunityChannelMessageId(body.id),
        new CommunityId(communityId),
        communityChannelId,
        authorIdentityId,
        new Timestamp(body.createdAt),
      ),
      new CommunityChannelMessageEncryptedPayload(body.encryptedPayload),
      new Signature(body.signature),
      (body.attachmentExternalIdentifiers ?? []).map(
        (externalIdentifier) =>
          new CommunityChannelAttachmentId(externalIdentifier),
      ),
    );
    const primitives = message.toPrimitives();
    const isValidSignature = this.signatureService.isValidSignature(
      PublicKey.fromPEM(authorIdentityId.toString()),
      primitives,
      new Signature(body.signature),
    );

    if (!isValidSignature) {
      throw new InvalidCommunityChannelMessageSignatureError();
    }

    await this.messageRepository().save(message);
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasSentEvent(communityId, {
        authorIdentityId: authorIdentityId.valueOf(),
        channelId,
        community: communityPrimitives,
        communityId,
        memberIds: communityPrimitives.memberIds,
        message: primitives,
        messageId: body.id,
        networkId: communityPrimitives.networkId,
      }),
    ]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityChannelMessageViewModel(message).toResource());
  }
}
