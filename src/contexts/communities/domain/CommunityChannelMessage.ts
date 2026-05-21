import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
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

  public static poll(
    metadata: CommunityChannelMessageMetadata,
    pollId: PollId,
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      metadata,
      undefined,
      undefined,
      [],
      [],
      undefined,
      pollId,
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
      primitives.encryptedPayload
        ? new CommunityChannelMessageEncryptedPayload(
            primitives.encryptedPayload,
          )
        : undefined,
      primitives.signature ? new Signature(primitives.signature) : undefined,
      primitives.attachmentExternalIdentifiers.map(
        (externalIdentifier) =>
          new CommunityChannelAttachmentId(externalIdentifier),
      ),
      (primitives.mentions || []).map((mention) =>
        CommunityChannelMessageMention.fromPrimitives(mention),
      ),
      primitives.editedAt ? new Timestamp(primitives.editedAt) : undefined,
      primitives.pollId ? new PollId(primitives.pollId) : undefined,
    );
  }

  constructor(
    private readonly metadata: CommunityChannelMessageMetadata,
    private readonly encryptedPayload:
      | CommunityChannelMessageEncryptedPayload
      | undefined,
    private readonly signature: Signature | undefined,
    private readonly attachmentExternalIdentifiers: Attachments,
    private readonly mentions: Mentions,
    private readonly editedAt?: Timestamp,
    private readonly pollId?: PollId,
  ) {}

  private type(): 'poll' | 'sent' {
    return this.pollId ? 'poll' : 'sent';
  }

  public getAuthorIdentityId(): IdentityId {
    return this.metadata.getAuthorIdentityId();
  }

  public getMentions(): CommunityChannelMessageMention[] {
    return this.mentions;
  }

  public edit(
    encryptedPayload: CommunityChannelMessageEncryptedPayload,
    signature: Signature,
    editedAt: Timestamp,
    attachmentExternalIdentifiers: Attachments,
    mentions: Mentions,
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      this.metadata,
      encryptedPayload,
      signature,
      attachmentExternalIdentifiers,
      mentions,
      editedAt,
    );
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
      editedAt: this.editedAt?.valueOf(),
      encryptedPayload: this.encryptedPayload?.valueOf(),
      id: this.metadata.getId().valueOf(),
      mentions: this.mentions.map((mention) => mention.toPrimitives()),
      pollId: this.pollId?.valueOf(),
      signature: this.signature?.valueOf(),
      type: this.type(),
    };
  }
}
