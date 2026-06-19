import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageAttachments as Attachments } from '../../types/CommunityChannelMessageAttachments';
import { CommunityChannelMessageMentions as Mentions } from '../../types/CommunityChannelMessageMentions';
import { CommunityChannelAttachmentId } from '../../value-objects/CommunityChannelAttachmentId';
import { CommunityChannelId } from '../../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../value-objects/CommunityId';
import { CommunityChannelMessageMention } from './CommunityChannelMessageMention';
import { CommunityChannelMessageMetadata } from './CommunityChannelMessageMetadata';
import { CommunityChannelMessagePayload } from './CommunityChannelMessagePayload';
import { CommunityChannelMessageSignaturePayload } from './CommunityChannelMessageSignaturePayload';

export class CommunityChannelMessage {
  public static create(
    metadata: CommunityChannelMessageMetadata,
    payload: CommunityChannelMessagePayload,
    signature: Signature,
    attachmentExternalIdentifiers: Attachments = [],
    mentions: Mentions = [],
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      metadata,
      payload,
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
        primitives.replyToMessageId
          ? new CommunityChannelMessageId(primitives.replyToMessageId)
          : undefined,
      ),
      primitives.encryptedPayload || primitives.plaintextPayload
        ? CommunityChannelMessagePayload.fromPrimitives({
            encryptedPayload: primitives.encryptedPayload,
            plaintextPayload: primitives.plaintextPayload,
          })
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
    private readonly payload: CommunityChannelMessagePayload | undefined,
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

  public getId(): CommunityChannelMessageId {
    return this.metadata.getId();
  }

  public wasAuthoredBy(identityId: IdentityId): boolean {
    return this.metadata.getAuthorIdentityId().isEqual(identityId);
  }

  public getChannelId(): CommunityChannelId {
    return this.metadata.getChannelId();
  }

  public isIdentifiedBy(messageId: CommunityChannelMessageId): boolean {
    return this.metadata.getId().isEqual(messageId);
  }

  public hasPlaintextPayload(): boolean {
    return this.payload?.isPlaintext() ?? false;
  }

  public toSignaturePayload(): CommunityChannelMessageSignaturePayload {
    const primitives = this.toPrimitives();

    return CommunityChannelMessageSignaturePayload.fromPrimitives({
      attachmentExternalIdentifiers: primitives.attachmentExternalIdentifiers,
      authorIdentityId: primitives.authorIdentityId,
      channelId: primitives.channelId,
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      encryptedPayload: primitives.encryptedPayload,
      id: primitives.id,
      mentions: primitives.mentions,
      plaintextPayload: primitives.plaintextPayload,
      replyToMessageId: primitives.replyToMessageId,
      type: primitives.type,
    });
  }

  public getMentions(): CommunityChannelMessageMention[] {
    return this.mentions;
  }

  public edit(
    payload: CommunityChannelMessagePayload,
    signature: Signature,
    editedAt: Timestamp,
    attachmentExternalIdentifiers: Attachments,
    mentions: Mentions,
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      this.metadata,
      payload,
      signature,
      attachmentExternalIdentifiers,
      mentions,
      editedAt,
    );
  }

  public toPrimitives() {
    const payload = this.payload?.toPrimitives();

    return {
      attachmentExternalIdentifiers: this.attachmentExternalIdentifiers.map(
        (externalIdentifier) => externalIdentifier.valueOf(),
      ),
      authorIdentityId: this.metadata.getAuthorIdentityId().valueOf(),
      channelId: this.metadata.getChannelId().valueOf(),
      communityId: this.metadata.getCommunityId().valueOf(),
      createdAt: this.metadata.getCreatedAt().valueOf(),
      editedAt: this.editedAt?.valueOf(),
      encryptedPayload: payload?.encryptedPayload,
      id: this.metadata.getId().valueOf(),
      mentions: this.mentions.map((mention) => mention.toPrimitives()),
      plaintextPayload: payload?.plaintextPayload,
      pollId: this.pollId?.valueOf(),
      replyToMessageId: this.metadata.getReplyToMessageId()?.valueOf(),
      signature: this.signature?.valueOf(),
      type: this.type(),
    };
  }
}
