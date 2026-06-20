import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageAttachments } from '../../../domain/CommunityChannelMessageAttachments';
import { CommunityChannelMessageMentions } from '../../../domain/CommunityChannelMessageMentions';
import { CommunityChannelMessageEdition } from '../../../domain/entities/messages/CommunityChannelMessageEdition';
import { CommunityChannelMessageMention } from '../../../domain/entities/messages/CommunityChannelMessageMention';
import { CommunityChannelMessagePayload } from '../../../domain/entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelMessageSignaturePayload } from '../../../domain/entities/messages/CommunityChannelMessageSignaturePayload';
import { CommunityChannelAttachmentId } from '../../../domain/value-objects/CommunityChannelAttachmentId';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityMentionTargetId } from '../../../domain/value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from '../../../domain/value-objects/CommunityMentionType';

export class CommunityChannelMessageEditMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly edition: CommunityChannelMessageEdition;
  public readonly messageId: CommunityChannelMessageId;
  public readonly signature: Signature;
  public readonly signaturePayload: CommunityChannelMessageSignaturePayload;

  constructor(input: {
    actorIdentityId: string;
    attachmentExternalIdentifiers?: string[];
    channelId: string;
    communityId: string;
    createdAt: number;
    encryptedPayload?: string;
    mentions?: Array<{ targetId?: string; type: string }>;
    messageId: string;
    plaintextPayload?: string;
    signature: string;
  }) {
    this.actorIdentityId = new IdentityId(input.actorIdentityId);
    this.communityId = new CommunityId(input.communityId);
    this.channelId = new CommunityChannelId(input.channelId);
    this.messageId = new CommunityChannelMessageId(input.messageId);
    this.signature = new Signature(input.signature);

    const payload = CommunityChannelMessagePayload.fromPrimitives({
      encryptedPayload: input.encryptedPayload,
      plaintextPayload: input.plaintextPayload,
    });
    const mentions = CommunityChannelMessageMentions.from(
      (input.mentions ?? []).map(
        (mention) =>
          new CommunityChannelMessageMention(
            new CommunityMentionType(mention.type),
            mention.targetId
              ? new CommunityMentionTargetId(mention.targetId)
              : undefined,
          ),
      ),
    );
    const attachmentExternalIdentifiers =
      CommunityChannelMessageAttachments.from(
        (input.attachmentExternalIdentifiers ?? []).map(
          (externalIdentifier) =>
            new CommunityChannelAttachmentId(externalIdentifier),
        ),
      );

    this.edition = new CommunityChannelMessageEdition(
      payload,
      this.signature,
      new Timestamp(input.createdAt),
      attachmentExternalIdentifiers,
      mentions,
    );
    this.signaturePayload =
      CommunityChannelMessageSignaturePayload.fromPrimitives({
        attachmentExternalIdentifiers:
          input.attachmentExternalIdentifiers ?? [],
        authorIdentityId: input.actorIdentityId,
        channelId: input.channelId,
        communityId: input.communityId,
        createdAt: input.createdAt,
        encryptedPayload: input.encryptedPayload,
        id: input.messageId,
        mentions: mentions.toPrimitives(),
        plaintextPayload: input.plaintextPayload,
        type: 'edited',
      });
  }
}
