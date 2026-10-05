import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageMentions as Mentions } from '../../CommunityChannelMessageMentions';
import { CommunityChannelId } from '../../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../value-objects/CommunityId';
import { CommunityChannelMessageMention } from './CommunityChannelMessageMention';
import { CommunityChannelMessageMetadata } from './CommunityChannelMessageMetadata';
import { CommunityChannelMessagePayload } from './CommunityChannelMessagePayload';

export class CommunityChannelMessage {
  public static create(
    metadata: CommunityChannelMessageMetadata,
    payload: CommunityChannelMessagePayload,
    mentions: Mentions = Mentions.empty(),
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(metadata, payload, mentions);
  }

  public static poll(
    metadata: CommunityChannelMessageMetadata,
    pollId: PollId,
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      metadata,
      undefined,
      Mentions.empty(),
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
      Mentions.from(
        (primitives.mentions || []).map((mention) =>
          CommunityChannelMessageMention.fromPrimitives(mention),
        ),
      ),
      primitives.editedAt ? new Timestamp(primitives.editedAt) : undefined,
      primitives.pollId ? new PollId(primitives.pollId) : undefined,
    );
  }

  constructor(
    private readonly metadata: CommunityChannelMessageMetadata,
    private readonly payload: CommunityChannelMessagePayload | undefined,
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

  public getCreatedAt(): Timestamp {
    return this.metadata.getCreatedAt();
  }

  public isIdentifiedBy(messageId: CommunityChannelMessageId): boolean {
    return this.metadata.getId().isEqual(messageId);
  }

  public hasPlaintextPayload(): boolean {
    return this.payload?.isPlaintext() ?? false;
  }

  public getMentions(): Mentions {
    return this.mentions;
  }

  public edit(
    payload: CommunityChannelMessagePayload,
    editedAt: Timestamp,
    mentions: Mentions,
  ): CommunityChannelMessage {
    return new CommunityChannelMessage(
      this.metadata,
      payload,
      mentions,
      editedAt,
    );
  }

  public toPrimitives() {
    const payload = this.payload?.toPrimitives();

    return {
      authorIdentityId: this.metadata.getAuthorIdentityId().valueOf(),
      channelId: this.metadata.getChannelId().valueOf(),
      communityId: this.metadata.getCommunityId().valueOf(),
      createdAt: this.metadata.getCreatedAt().valueOf(),
      editedAt: this.editedAt?.valueOf(),
      encryptedPayload: payload?.encryptedPayload,
      id: this.metadata.getId().valueOf(),
      mentions: this.mentions.toPrimitives(),
      plaintextPayload: payload?.plaintextPayload,
      pollId: this.pollId?.valueOf(),
      replyToMessageId: this.metadata.getReplyToMessageId()?.valueOf(),
      type: this.type(),
    };
  }
}
