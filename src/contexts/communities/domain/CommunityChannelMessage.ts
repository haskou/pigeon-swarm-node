import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageMention } from './CommunityChannelMessageMention';
import { CommunityChannelMessageMetadata } from './CommunityChannelMessageMetadata';
import { CommunityChannelAttachmentId } from './value-objects/CommunityChannelAttachmentId';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelMessageEncryptedPayload } from './value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';
import { CommunityId } from './value-objects/CommunityId';

type Attachments = CommunityChannelAttachmentId[];
type Mentions = CommunityChannelMessageMention[];
export type CommunityChannelMessagePrimitives = ReturnType<
  CommunityChannelMessage['toPrimitives']
>;

export class CommunityChannelMessage {
  public static create(
    metadata: CommunityChannelMessageMetadata,
    encryptedPayload: CommunityChannelMessageEncryptedPayload,
    signature: Signature,
    attachmentExternalIdentifiers: Attachments = [],
    mentions: Mentions = [],
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      metadata,
      encryptedPayload,
      signature,
      attachmentExternalIdentifiers,
      mentions,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityChannelMessage>,
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      new CommunityChannelMessageMetadata(
        new CommunityChannelMessageId(primitives.id),
        new CommunityId(primitives.communityId),
        new CommunityChannelId(primitives.channelId),
        new IdentityId(primitives.authorIdentityId),
        new Timestamp(primitives.createdAt),
      ),
      new CommunityChannelMessageEncryptedPayload(primitives.encryptedPayload),
      new Signature(primitives.signature),
      primitives.attachmentExternalIdentifiers.map(
        (externalIdentifier) =>
          new CommunityChannelAttachmentId(externalIdentifier),
      ),
      (primitives.mentions || []).map((mention) =>
        CommunityChannelMessageMention.fromPrimitives(mention),
      ),
    );
  }

  constructor(
    private readonly metadata: CommunityChannelMessageMetadata,
    private readonly encryptedPayload: CommunityChannelMessageEncryptedPayload,
    private readonly signature: Signature,
    private readonly attachmentExternalIdentifiers: Attachments,
    private readonly mentions: Mentions,
  ) {}

  private type(): 'sent' {
    return 'sent';
  }

  public getAuthorIdentityId(): IdentityId {
    return this.metadata.getAuthorIdentityId();
  }

  public getMentions(): CommunityChannelMessageMention[] {
    return this.mentions;
  }

  public toPrimitives() {
    return {
      attachmentExternalIdentifiers: this.attachmentExternalIdentifiers.map(
        (externalIdentifier) => externalIdentifier.valueOf(),
      ),
      authorIdentityId: this.metadata.getAuthorIdentityId().valueOf(),
      channelId: this.metadata.getChannelId().valueOf(),
      communityId: this.metadata.getCommunityId().valueOf(),
      createdAt: this.metadata.getCreatedAt().valueOf(),
      encryptedPayload: this.encryptedPayload.valueOf(),
      id: this.metadata.getId().valueOf(),
      mentions: this.mentions.map((mention) => mention.toPrimitives()),
      signature: this.signature.valueOf(),
      type: this.type(),
    };
  }
}
