import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageMention } from '../../../domain/entities/messages/CommunityChannelMessageMention';
import { CommunityChannelMessageMetadata } from '../../../domain/entities/messages/CommunityChannelMessageMetadata';
import { CommunityChannelMessagePayload } from '../../../domain/entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelAttachmentId } from '../../../domain/value-objects/CommunityChannelAttachmentId';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityMentionTargetId } from '../../../domain/value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from '../../../domain/value-objects/CommunityMentionType';
import { CommunityChannelMessageSendInput } from './CommunityChannelMessageSendInput';

export class CommunityChannelMessageSendMessage {
  public readonly attachmentExternalIdentifiers: CommunityChannelAttachmentId[];
  public readonly authorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly mentions: CommunityChannelMessageMention[];
  public readonly metadata: CommunityChannelMessageMetadata;
  public readonly payload: CommunityChannelMessagePayload;
  public readonly replyToMessageId?: CommunityChannelMessageId;
  public readonly signature: Signature;

  constructor(input: CommunityChannelMessageSendInput) {
    this.authorIdentityId = new IdentityId(input.authorIdentityId);
    this.communityId = new CommunityId(input.communityId);
    this.channelId = new CommunityChannelId(input.channelId);
    this.replyToMessageId = input.replyToMessageId
      ? new CommunityChannelMessageId(input.replyToMessageId)
      : undefined;
    this.metadata = new CommunityChannelMessageMetadata(
      new CommunityChannelMessageId(input.messageId),
      this.communityId,
      this.channelId,
      this.authorIdentityId,
      new Timestamp(input.createdAt),
      this.replyToMessageId,
    );
    this.payload = CommunityChannelMessagePayload.fromPrimitives({
      encryptedPayload: input.encryptedPayload,
      plaintextPayload: input.plaintextPayload,
    });
    this.signature = new Signature(input.signature);
    this.attachmentExternalIdentifiers = (
      input.attachmentExternalIdentifiers ?? []
    ).map(
      (externalIdentifier) =>
        new CommunityChannelAttachmentId(externalIdentifier),
    );
    this.mentions = (input.mentions ?? []).map(
      (mention) =>
        new CommunityChannelMessageMention(
          new CommunityMentionType(mention.type),
          mention.targetId
            ? new CommunityMentionTargetId(mention.targetId)
            : undefined,
        ),
    );
  }
}
