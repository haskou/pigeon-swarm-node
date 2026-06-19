export class CommunityChannelMessageSignaturePayload {
  public static fromPrimitives(primitives: {
    actorIdentityId?: string;
    attachmentExternalIdentifiers?: string[];
    authorIdentityId?: string;
    channelId: string;
    communityId: string;
    createdAt: number;
    encryptedPayload?: string;
    id: string;
    mentions?: Array<{ targetId?: string; type: string }>;
    plaintextPayload?: string;
    replyToMessageId?: string;
    targetMessageId?: string;
    type: 'deleted' | 'edited' | 'poll' | 'sent';
  }): CommunityChannelMessageSignaturePayload {
    return new CommunityChannelMessageSignaturePayload(primitives);
  }

  private constructor(
    private readonly primitives: {
      actorIdentityId?: string;
      attachmentExternalIdentifiers?: string[];
      authorIdentityId?: string;
      channelId: string;
      communityId: string;
      createdAt: number;
      encryptedPayload?: string;
      id: string;
      mentions?: Array<{ targetId?: string; type: string }>;
      plaintextPayload?: string;
      replyToMessageId?: string;
      targetMessageId?: string;
      type: 'deleted' | 'edited' | 'poll' | 'sent';
    },
  ) {}

  private mentions():
    | Array<{
        targetId?: string;
        type: string;
      }>
    | undefined {
    return this.primitives.mentions && this.primitives.mentions.length > 0
      ? this.primitives.mentions
      : undefined;
  }

  private isMessagePayload(): boolean {
    return (
      this.primitives.type === 'edited' ||
      this.primitives.type === 'poll' ||
      this.primitives.type === 'sent'
    );
  }

  public toPrimitives(): {
    actorIdentityId?: string;
    attachmentExternalIdentifiers?: string[];
    authorIdentityId?: string;
    channelId: string;
    communityId: string;
    createdAt: number;
    encryptedPayload?: string;
    id: string;
    mentions?: Array<{ targetId?: string; type: string }>;
    plaintextPayload?: string;
    replyToMessageId?: string;
    targetMessageId?: string;
    type: 'deleted' | 'edited' | 'poll' | 'sent';
  } {
    if (this.primitives.type === 'deleted') {
      return {
        actorIdentityId: this.primitives.actorIdentityId,
        channelId: this.primitives.channelId,
        communityId: this.primitives.communityId,
        createdAt: this.primitives.createdAt,
        id: this.primitives.id,
        targetMessageId: this.primitives.targetMessageId,
        type: this.primitives.type,
      };
    }

    return {
      attachmentExternalIdentifiers:
        this.primitives.attachmentExternalIdentifiers ?? [],
      authorIdentityId: this.primitives.authorIdentityId,
      channelId: this.primitives.channelId,
      communityId: this.primitives.communityId,
      createdAt: this.primitives.createdAt,
      encryptedPayload: this.primitives.encryptedPayload,
      id: this.primitives.id,
      mentions: this.mentions(),
      plaintextPayload: this.primitives.plaintextPayload,
      replyToMessageId: this.primitives.replyToMessageId,
      type: this.primitives.type,
    };
  }

  public toSigningPrimitiveCandidates(): Array<Record<string, unknown>> {
    const canonicalPayload = this.toPrimitives();

    if (
      !this.isMessagePayload() ||
      !this.primitives.mentions ||
      this.primitives.mentions.length > 0
    ) {
      return [canonicalPayload];
    }

    return [
      canonicalPayload,
      {
        ...canonicalPayload,
        mentions: [],
      },
    ];
  }
}
