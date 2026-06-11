import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';

type RepairResult = {
  communities: number;
  communityThreadSummaries: number;
  identities: number;
  keychains: number;
};

export default class OrbitDBMetadataHeadRepairer {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] {
    const value = document[attribute];

    return this.isStringArray(value) ? value : [];
  }

  private identityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'identityId') ||
      this.stringValue(document, 'id')
    );
  }

  private ownerIdentityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return (
      this.stringValue(document, 'ownerIdentityId') ||
      this.stringValue(document, 'id')
    );
  }

  private communityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    return this.stringValue(document, 'id');
  }

  private networkIdsFrom(document: Record<string, unknown>): string[] {
    const networkIds = this.isStringArray(document.networkIds)
      ? document.networkIds
      : [];
    const networkId = this.stringValue(document, 'networkId');

    return [...new Set([...networkIds, ...(networkId ? [networkId] : [])])];
  }

  private isLiveDocument(document: Record<string, unknown>): boolean {
    return (
      document.deleted !== true && Boolean(this.stringValue(document, 'cid'))
    );
  }

  private isLiveCommunityDocument(document: Record<string, unknown>): boolean {
    return document.deleted !== true && Boolean(this.communityIdFrom(document));
  }

  private isLiveCommunityChannelMessageDocument(
    document: Record<string, unknown>,
  ): boolean {
    return (
      document.deleted !== true &&
      this.stringValue(document, 'scopeType') === 'community_channel' &&
      Boolean(this.stringValue(document, 'communityId')) &&
      Boolean(this.stringValue(document, 'channelId')) &&
      Boolean(this.stringValue(document, 'id')) &&
      typeof document.createdAt === 'number'
    );
  }

  private async repairIdentityHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'identities',
      (document) =>
        this.isLiveDocument(document) && Boolean(this.identityIdFrom(document)),
    );

    for (const document of documents) {
      const identityId = this.identityIdFrom(document);

      if (!identityId) {
        continue;
      }

      const networkIds = this.networkIdsFrom(document);

      await this.registry.putHead(
        `identity:${identityId}`,
        document,
        networkIds,
      );

      const handle = this.stringValue(document, 'handle');

      if (handle) {
        await this.registry.putHead(
          `identity-handle:${handle}`,
          document,
          networkIds,
        );
      }
    }

    return documents.length;
  }

  private communityDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    const communities = record?.communities;

    if (!Array.isArray(communities)) {
      return [];
    }

    return communities.filter(
      (community): community is Record<string, unknown> =>
        typeof community === 'object' &&
        community !== null &&
        !Array.isArray(community),
    );
  }

  private putIndexedCommunity(
    documents: Record<string, unknown>[],
    community: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const communityId = this.communityIdFrom(community);

    if (!communityId) {
      return documents;
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const document of documents) {
      const documentId = this.communityIdFrom(document);

      if (documentId) {
        merged.set(documentId, document);
      }
    }

    merged.set(communityId, community);

    return [...merged.values()];
  }

  private async putCommunityMemberIndex(
    memberId: string,
    community: Record<string, unknown>,
  ): Promise<void> {
    const key = `community-member-index:${memberId}`;
    const communities = this.putIndexedCommunity(
      this.communityDocumentsFromIndex(await this.registry.findHead(key)),
      community,
    ).filter((document) =>
      this.stringArrayValue(document, 'memberIds').includes(memberId),
    );

    await this.registry.putHead(key, {
      communities,
      id: key,
      memberId,
      updatedAt: Date.now(),
    });
  }

  private async repairCommunityHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'communities',
      (document) => this.isLiveCommunityDocument(document),
    );

    for (const document of documents) {
      const communityId = this.communityIdFrom(document);

      if (!communityId) {
        continue;
      }

      await this.registry.putHead(
        `community:${communityId}`,
        document,
        this.networkIdsFrom(document),
      );

      await Promise.all(
        this.stringArrayValue(document, 'memberIds').map((memberId) =>
          this.putCommunityMemberIndex(memberId, document),
        ),
      );
    }

    return documents.length;
  }

  private async repairKeychainHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'keychains',
      (document) =>
        this.isLiveDocument(document) &&
        Boolean(this.ownerIdentityIdFrom(document)),
    );

    for (const document of documents) {
      const ownerIdentityId = this.ownerIdentityIdFrom(document);

      if (!ownerIdentityId) {
        continue;
      }

      await this.registry.putHead(`keychain:${ownerIdentityId}`, document);
    }

    return documents.length;
  }

  private messageIdFrom(document: Record<string, unknown>): string | undefined {
    return (
      this.stringValue(document, 'messageId') ||
      this.stringValue(document, 'id')
    );
  }

  private communityChannelThreadSummaryHeadKey(
    communityId: string,
    channelId: string,
  ): string {
    return `community-channel-thread-summaries:${communityId}:${channelId}`;
  }

  private channelGroupKey(document: Record<string, unknown>): string {
    return `${this.stringValue(document, 'communityId')}:${this.stringValue(
      document,
      'channelId',
    )}`;
  }

  private groupCommunityChannelMessages(
    documents: Record<string, unknown>[],
  ): Map<string, Record<string, unknown>[]> {
    const grouped = new Map<string, Record<string, unknown>[]>();

    for (const document of documents) {
      const key = this.channelGroupKey(document);
      const messages = grouped.get(key) || [];

      messages.push(document);
      grouped.set(key, messages);
    }

    return grouped;
  }

  private threadRootIdsFrom(documents: Record<string, unknown>[]): Set<string> {
    return new Set(
      documents
        .map((document) => this.stringValue(document, 'replyToMessageId'))
        .filter((id): id is string => typeof id === 'string'),
    );
  }

  private existingThreadRootIdsFrom(
    documents: Record<string, unknown>[],
    rootIds: Set<string>,
  ): Set<string> {
    return new Set(
      documents
        .filter((document) => {
          const messageId = this.messageIdFrom(document);

          return messageId ? rootIds.has(messageId) : false;
        })
        .map((document) => this.messageIdFrom(document))
        .filter((id): id is string => typeof id === 'string'),
    );
  }

  private byCreatedAtAscending(
    documents: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    return documents.sort(
      (left, right) =>
        (this.numberValue(left, 'createdAt') || 0) -
        (this.numberValue(right, 'createdAt') || 0),
    );
  }

  private threadReplyFrom(
    document: Record<string, unknown>,
    existingRootIds: Set<string>,
  ):
    | {
        createdAt: number;
        messageId: string;
        rootMessageId: string;
      }
    | undefined {
    const rootMessageId = this.stringValue(document, 'replyToMessageId');
    const messageId = this.messageIdFrom(document);
    const createdAt = this.numberValue(document, 'createdAt');

    if (!rootMessageId || !messageId || !createdAt) {
      return undefined;
    }

    if (!existingRootIds.has(rootMessageId)) {
      return undefined;
    }

    return { createdAt, messageId, rootMessageId };
  }

  private lastReplyMessageIdFor(
    current: Record<string, unknown> | undefined,
    messageId: string,
    createdAt: number,
  ): string | undefined {
    const currentLastReplyAt = this.numberValue(current || {}, 'lastReplyAt');

    return !current || (currentLastReplyAt || 0) <= createdAt
      ? messageId
      : this.stringValue(current, 'lastReplyMessageId');
  }

  private registerThreadSummary(
    summaries: Map<string, Record<string, unknown>>,
    reply: {
      createdAt: number;
      messageId: string;
      rootMessageId: string;
    },
  ): void {
    const current = summaries.get(reply.rootMessageId);
    const currentLastReplyAt = this.numberValue(current || {}, 'lastReplyAt');

    summaries.set(reply.rootMessageId, {
      lastReplyAt: Math.max(currentLastReplyAt || 0, reply.createdAt),
      lastReplyMessageId: this.lastReplyMessageIdFor(
        current,
        reply.messageId,
        reply.createdAt,
      ),
      replyCount: (this.numberValue(current || {}, 'replyCount') || 0) + 1,
      rootMessageId: reply.rootMessageId,
    });
  }

  private threadSummariesFrom(
    documents: Record<string, unknown>[],
  ): Array<Record<string, unknown>> {
    const existingRootIds = this.existingThreadRootIdsFrom(
      documents,
      this.threadRootIdsFrom(documents),
    );
    const summaries = new Map<string, Record<string, unknown>>();

    for (const document of this.byCreatedAtAscending(documents)) {
      const reply = this.threadReplyFrom(document, existingRootIds);

      if (reply) {
        this.registerThreadSummary(summaries, reply);
      }
    }

    return [...summaries.values()].sort(
      (left, right) =>
        (this.numberValue(right, 'lastReplyAt') || 0) -
        (this.numberValue(left, 'lastReplyAt') || 0),
    );
  }

  private async repairCommunityThreadSummaryHeads(): Promise<number> {
    const documents = await this.registry.queryDocuments(
      'messages',
      (document) => this.isLiveCommunityChannelMessageDocument(document),
    );
    const grouped = this.groupCommunityChannelMessages(documents);

    for (const [key, channelDocuments] of grouped) {
      const [communityId, channelId] = key.split(':');

      if (!communityId || !channelId) {
        continue;
      }

      await this.registry.putHead(
        this.communityChannelThreadSummaryHeadKey(communityId, channelId),
        {
          channelId,
          communityId,
          id: this.communityChannelThreadSummaryHeadKey(communityId, channelId),
          summaries: this.threadSummariesFrom(channelDocuments),
          updatedAt: Date.now(),
        },
      );
    }

    return grouped.size;
  }

  public async repair(): Promise<RepairResult> {
    const [communities, identities, keychains, communityThreadSummaries] =
      await Promise.all([
        this.repairCommunityHeads(),
        this.repairIdentityHeads(),
        this.repairKeychainHeads(),
        this.repairCommunityThreadSummaryHeads(),
      ]);

    return { communities, communityThreadSummaries, identities, keychains };
  }
}
