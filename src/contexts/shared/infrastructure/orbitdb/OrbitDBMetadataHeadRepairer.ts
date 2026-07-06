import { CriticalRepairResult } from './CriticalRepairResult';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import OrbitDBReplicatedStateRegistry from './OrbitDBReplicatedStateRegistry';
import { RepairResult } from './RepairResult';
import { SecondaryRepairResult } from './SecondaryRepairResult';

export default class OrbitDBMetadataHeadRepairer {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private recordArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): Record<string, unknown>[] {
    const value = document[attribute];

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is Record<string, unknown> =>
      this.isRecord(item),
    );
  }

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
    const identityId = this.stringValue(document, 'identityId');
    const identity = this.isRecord(document.identity)
      ? document.identity
      : undefined;
    const embeddedIdentityId = identity
      ? this.stringValue(identity, 'id')
      : undefined;

    if (identityId && embeddedIdentityId && identityId !== embeddedIdentityId) {
      return undefined;
    }

    return identityId || embeddedIdentityId;
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

  private documentFreshness(document: Record<string, unknown>): number {
    return Math.max(
      ...['deletedAt', 'receivedAt', 'updatedAt', 'createdAt']
        .map((attribute) => document[attribute])
        .filter((value): value is number => typeof value === 'number'),
      0,
    );
  }

  private documentVersion(document: Record<string, unknown>): number {
    return this.numberValue(document, 'version') || 0;
  }

  private isNewerDocument(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const currentVersion = this.documentVersion(current);
    const candidateVersion = this.documentVersion(candidate);

    if (currentVersion !== candidateVersion) {
      return currentVersion < candidateVersion;
    }

    return this.documentFreshness(current) <= this.documentFreshness(candidate);
  }

  private deduplicateById(
    documents: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const deduplicated = new Map<string, Record<string, unknown>>();

    for (const document of documents) {
      const id = this.stringValue(document, 'id');

      if (!id) {
        continue;
      }

      const current = deduplicated.get(id);

      if (!current || this.isNewerDocument(current, document)) {
        deduplicated.set(id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private deduplicateBy(
    documents: Record<string, unknown>[],
    keyFor: (document: Record<string, unknown>) => string | undefined,
  ): Record<string, unknown>[] {
    const deduplicated = new Map<string, Record<string, unknown>>();

    for (const document of documents) {
      const key = keyFor(document);

      if (!key) {
        continue;
      }

      const current = deduplicated.get(key);

      if (!current || this.isNewerDocument(current, document)) {
        deduplicated.set(key, document);
      }
    }

    return [...deduplicated.values()];
  }

  private groupDocumentsBy(
    documents: Record<string, unknown>[],
    keyFor: (document: Record<string, unknown>) => string | undefined,
  ): Map<string, Record<string, unknown>[]> {
    const grouped = new Map<string, Record<string, unknown>[]>();

    for (const document of documents) {
      const key = keyFor(document);

      if (!key) {
        continue;
      }

      grouped.set(key, [...(grouped.get(key) || []), document]);
    }

    return grouped;
  }

  private async queryRepairDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
    operation: string,
  ): Promise<Record<string, unknown>[]> {
    return this.registry.queryDocuments(storeName, matcher, {
      mode: 'repair',
      operation,
    });
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
    const documents = await this.queryRepairDocuments(
      'identities',
      (document) =>
        this.isLiveDocument(document) && Boolean(this.identityIdFrom(document)),
      'OrbitDBMetadataHeadRepairer.repairIdentityHeads',
    );

    const latestDocuments = this.deduplicateBy(documents, (document) =>
      this.identityIdFrom(document),
    );

    for (const document of latestDocuments) {
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

    return latestDocuments.length;
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
    const documents = await this.queryRepairDocuments(
      'communities',
      (document) => this.isLiveCommunityDocument(document),
      'OrbitDBMetadataHeadRepairer.repairCommunityHeads',
    );

    const latestDocuments = this.deduplicateBy(documents, (document) =>
      this.communityIdFrom(document),
    );

    for (const document of latestDocuments) {
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

    return latestDocuments.length;
  }

  private async repairKeychainHeads(): Promise<number> {
    const documents = await this.queryRepairDocuments(
      'keychains',
      (document) =>
        this.isLiveDocument(document) &&
        Boolean(this.ownerIdentityIdFrom(document)),
      'OrbitDBMetadataHeadRepairer.repairKeychainHeads',
    );

    for (const document of documents) {
      const cid = this.stringValue(document, 'cid');

      if (!cid) {
        continue;
      }

      await this.registry.putHead(`keychain-cid:${cid}`, document);
    }

    const latestDocuments = this.deduplicateBy(documents, (document) =>
      this.ownerIdentityIdFrom(document),
    );

    for (const document of latestDocuments) {
      const ownerIdentityId = this.ownerIdentityIdFrom(document);

      if (!ownerIdentityId) {
        continue;
      }

      await this.registry.putHead(`keychain:${ownerIdentityId}`, document);
    }

    return documents.length;
  }

  private isConversationDocument(document: Record<string, unknown>): boolean {
    return (
      document.deleted !== true &&
      Boolean(this.stringValue(document, 'id')) &&
      Boolean(this.stringValue(document, 'networkId')) &&
      this.stringArrayValue(document, 'participantIds').length > 0 &&
      Boolean(this.stringValue(document, 'type')) &&
      typeof document.createdAt === 'number'
    );
  }

  private async repairConversationHeads(): Promise<{
    participantIndexes: number;
    conversations: number;
  }> {
    const documents = await this.queryRepairDocuments(
      'conversations',
      (document) => this.isConversationDocument(document),
      'OrbitDBMetadataHeadRepairer.repairConversationHeads',
    );
    const participantIndexes = new Map<string, Record<string, unknown>[]>();

    const latestDocuments = this.deduplicateBy(documents, (document) =>
      this.stringValue(document, 'id'),
    );

    for (const document of latestDocuments) {
      const conversationId = this.stringValue(document, 'id');
      const networkIds = this.networkIdsFrom(document);

      if (!conversationId) {
        continue;
      }

      await this.registry.putHead(
        `conversation:${conversationId}`,
        { ...document },
        networkIds,
      );

      for (const participantId of this.stringArrayValue(
        document,
        'participantIds',
      )) {
        participantIndexes.set(participantId, [
          ...(participantIndexes.get(participantId) || []),
          document,
        ]);
      }
    }

    for (const [participantId, conversationDocuments] of participantIndexes) {
      const conversations = this.deduplicateById(conversationDocuments);
      const networkIds = [
        ...new Set(
          conversations.flatMap((document) => this.networkIdsFrom(document)),
        ),
      ];
      const key = `conversation-participant-index:${participantId}`;

      await this.registry.putHead(
        key,
        {
          conversations: conversations.map((document) => ({ ...document })),
          id: key,
          participantId,
          updatedAt: Date.now(),
        },
        networkIds,
      );
    }

    return {
      conversations: latestDocuments.length,
      participantIndexes: participantIndexes.size,
    };
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

  private communityChannelMessageIndexHeadKey(
    communityId: string,
    channelId: string,
  ): string {
    return `community-channel-message-index:${communityId}:${channelId}`;
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

  private async findLiveCommunityChannelMessageDocuments(): Promise<
    Record<string, unknown>[]
  > {
    return this.queryRepairDocuments(
      'messages',
      (document) => this.isLiveCommunityChannelMessageDocument(document),
      'OrbitDBMetadataHeadRepairer.findLiveCommunityChannelMessageDocuments',
    );
  }

  private isLiveConversationMessageDocument(
    document: Record<string, unknown>,
  ): boolean {
    return (
      document.deleted !== true &&
      this.stringValue(document, 'scopeType') === 'conversation' &&
      Boolean(this.stringValue(document, 'conversationId')) &&
      Boolean(this.stringValue(document, 'id')) &&
      typeof document.createdAt === 'number'
    );
  }

  private conversationMessageIndexHeadKey(conversationId: string): string {
    return `conversation-message-index:${conversationId}`;
  }

  private conversationMessageSummaryHeadKey(conversationId: string): string {
    return `conversation-message-summary:${conversationId}`;
  }

  private async findLiveConversationMessageDocuments(): Promise<
    Record<string, unknown>[]
  > {
    return this.queryRepairDocuments(
      'messages',
      (document) => this.isLiveConversationMessageDocument(document),
      'OrbitDBMetadataHeadRepairer.findLiveConversationMessageDocuments',
    );
  }

  private async repairConversationMessageIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const grouped = this.groupDocumentsBy(documents, (document) =>
      this.stringValue(document, 'conversationId'),
    );

    for (const [conversationId, conversationDocuments] of grouped) {
      const messages = this.deduplicateById(conversationDocuments);
      const networkIds = [
        ...new Set(
          messages.flatMap((document) => this.networkIdsFrom(document)),
        ),
      ];

      await this.registry.putHead(
        this.conversationMessageIndexHeadKey(conversationId),
        {
          conversationId,
          id: this.conversationMessageIndexHeadKey(conversationId),
          messages: messages.map((document) => ({ ...document })),
          updatedAt: Date.now(),
        },
        networkIds,
      );

      await this.registry.putHead(
        this.conversationMessageSummaryHeadKey(conversationId),
        {
          conversationId,
          id: this.conversationMessageSummaryHeadKey(conversationId),
          messages: messages.map((document) => ({
            authorId: this.stringValue(document, 'authorId'),
            conversationId,
            createdAt: this.numberValue(document, 'createdAt'),
            id: this.stringValue(document, 'id'),
            messageId: this.messageIdFrom(document),
            networkId: this.stringValue(document, 'networkId'),
            type: this.stringValue(document, 'type'),
            valid: document.valid,
          })),
          updatedAt: Date.now(),
        },
        networkIds,
      );
    }

    return grouped.size;
  }

  private async repairCommunityThreadSummaryHeads(
    documents: Record<string, unknown>[],
  ): Promise<number> {
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

  private async repairCommunityChannelMessageIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const grouped = this.groupCommunityChannelMessages(documents);

    for (const [key, channelDocuments] of grouped) {
      const [communityId, channelId] = key.split(':');

      if (!communityId || !channelId) {
        continue;
      }

      await this.registry.putHead(
        this.communityChannelMessageIndexHeadKey(communityId, channelId),
        {
          channelId,
          communityId,
          id: this.communityChannelMessageIndexHeadKey(communityId, channelId),
          messages: channelDocuments.map((document) => ({ ...document })),
          updatedAt: Date.now(),
        },
      );
    }

    return grouped.size;
  }

  private async findLivePinDocuments(): Promise<Record<string, unknown>[]> {
    return this.queryRepairDocuments(
      'pins',
      (document) =>
        document.removed !== true &&
        typeof document.createdAt === 'number' &&
        Boolean(this.stringValue(document, 'id')) &&
        Boolean(this.stringValue(document, 'messageId')),
      'OrbitDBMetadataHeadRepairer.findLivePinDocuments',
    );
  }

  private async repairConversationPinIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const grouped = this.groupDocumentsBy(
      documents.filter((document) =>
        Boolean(this.stringValue(document, 'conversationId')),
      ),
      (document) => this.stringValue(document, 'conversationId'),
    );

    for (const [conversationId, pinDocuments] of grouped) {
      const key = `conversation-pin-index:${conversationId}`;

      await this.registry.putHead(key, {
        conversationId,
        id: key,
        pins: this.deduplicateById(pinDocuments).map((document) => ({
          ...document,
        })),
        updatedAt: Date.now(),
      });
    }

    return grouped.size;
  }

  private async repairCommunityChannelPinIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const grouped = this.groupDocumentsBy(
      documents.filter(
        (document) =>
          Boolean(this.stringValue(document, 'communityId')) &&
          Boolean(this.stringValue(document, 'channelId')),
      ),
      (document) =>
        `${this.stringValue(document, 'communityId')}:${this.stringValue(
          document,
          'channelId',
        )}`,
    );

    for (const [keyParts, pinDocuments] of grouped) {
      const [communityId, channelId] = keyParts.split(':');

      if (!communityId || !channelId) {
        continue;
      }

      const key = `community-channel-pin-index:${communityId}:${channelId}`;

      await this.registry.putHead(key, {
        channelId,
        communityId,
        id: key,
        pins: this.deduplicateById(pinDocuments).map((document) => ({
          ...document,
        })),
        updatedAt: Date.now(),
      });
    }

    return grouped.size;
  }

  private async findLiveReactionDocuments(): Promise<
    Record<string, unknown>[]
  > {
    return this.queryRepairDocuments(
      'reactions',
      (document) =>
        document.removed !== true &&
        typeof document.createdAt === 'number' &&
        Boolean(this.stringValue(document, 'id')) &&
        Boolean(this.stringValue(document, 'messageId')),
      'OrbitDBMetadataHeadRepairer.findLiveReactionDocuments',
    );
  }

  private async repairReactionIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    let repairedIndexes = 0;
    const conversationReactions = this.groupDocumentsBy(
      documents.filter(
        (document) =>
          this.stringValue(document, 'scopeType') === 'conversation' &&
          Boolean(this.stringValue(document, 'conversationId')),
      ),
      (document) => this.stringValue(document, 'conversationId'),
    );
    const communityReactions = this.groupDocumentsBy(
      documents.filter(
        (document) =>
          this.stringValue(document, 'scopeType') === 'community_channel' &&
          Boolean(this.stringValue(document, 'communityId')),
      ),
      (document) => this.stringValue(document, 'communityId'),
    );

    for (const [conversationId, reactionDocuments] of conversationReactions) {
      const key = `conversation-reaction-index:${conversationId}`;

      await this.registry.putHead(key, {
        conversationId,
        id: key,
        reactions: this.deduplicateById(reactionDocuments).map((document) => ({
          ...document,
        })),
        updatedAt: Date.now(),
      });
      repairedIndexes += 1;
    }

    for (const [communityId, reactionDocuments] of communityReactions) {
      const key = `community-reaction-index:${communityId}`;

      await this.registry.putHead(key, {
        communityId,
        id: key,
        reactions: this.deduplicateById(reactionDocuments).map((document) => ({
          ...document,
        })),
        updatedAt: Date.now(),
      });
      repairedIndexes += 1;
    }

    return repairedIndexes;
  }

  private async findPollDocuments(): Promise<Record<string, unknown>[]> {
    return this.queryRepairDocuments(
      'polls',
      (document) =>
        Boolean(this.stringValue(document, 'id')) &&
        this.isRecord(document.scope),
      'OrbitDBMetadataHeadRepairer.findPollDocuments',
    );
  }

  private async repairPollIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    let repairedIndexes = 0;
    const communityPolls = this.groupDocumentsBy(
      documents.filter((document) => {
        const scope = document.scope;

        return (
          this.isRecord(scope) &&
          this.stringValue(scope, 'type') === 'community_channel' &&
          Boolean(this.stringValue(scope, 'communityId')) &&
          Boolean(this.stringValue(scope, 'channelId'))
        );
      }),
      (document) => {
        const scope = document.scope as Record<string, unknown>;

        return `${this.stringValue(scope, 'communityId')}:${this.stringValue(
          scope,
          'channelId',
        )}`;
      },
    );
    const groupConversationPolls = this.groupDocumentsBy(
      documents.filter((document) => {
        const scope = document.scope;

        return (
          this.isRecord(scope) &&
          this.stringValue(scope, 'type') === 'group_conversation' &&
          Boolean(this.stringValue(scope, 'conversationId'))
        );
      }),
      (document) =>
        this.stringValue(
          document.scope as Record<string, unknown>,
          'conversationId',
        ),
    );

    for (const document of documents) {
      const pollId = this.stringValue(document, 'id');

      if (!pollId) {
        continue;
      }

      await this.registry.putHead(
        `poll:${pollId}`,
        { ...document },
        this.networkIdsFrom(document),
      );
    }

    for (const [keyParts, pollDocuments] of communityPolls) {
      const [communityId, channelId] = keyParts.split(':');

      if (!communityId || !channelId) {
        continue;
      }

      const key = `poll-community-channel-index:${communityId}:${channelId}`;

      await this.registry.putHead(
        key,
        {
          channelId,
          communityId,
          id: key,
          polls: this.deduplicateById(pollDocuments).map((document) => ({
            ...document,
          })),
          updatedAt: Date.now(),
        },
        [
          ...new Set(
            pollDocuments.flatMap((document) => this.networkIdsFrom(document)),
          ),
        ],
      );
      repairedIndexes += 1;
    }

    for (const [conversationId, pollDocuments] of groupConversationPolls) {
      const key = `poll-group-conversation-index:${conversationId}`;

      await this.registry.putHead(
        key,
        {
          conversationId,
          id: key,
          polls: this.deduplicateById(pollDocuments).map((document) => ({
            ...document,
          })),
          updatedAt: Date.now(),
        },
        [
          ...new Set(
            pollDocuments.flatMap((document) => this.networkIdsFrom(document)),
          ),
        ],
      );
      repairedIndexes += 1;
    }

    return repairedIndexes;
  }

  private async findCallDocuments(): Promise<Record<string, unknown>[]> {
    return this.queryRepairDocuments(
      'calls',
      (document) =>
        Boolean(this.stringValue(document, 'id')) &&
        this.isRecord(document.scope) &&
        this.isStringArray(document.participantIds),
      'OrbitDBMetadataHeadRepairer.findCallDocuments',
    );
  }

  private async putCallIndex(
    key: string,
    attribute: string,
    value: string,
    documents: Record<string, unknown>[],
  ): Promise<void> {
    await this.registry.putHead(
      key,
      {
        [attribute]: value,
        calls: this.deduplicateById(documents).map((document) => ({
          ...document,
        })),
        id: key,
        updatedAt: Date.now(),
      },
      [
        ...new Set(
          documents.flatMap((document) => this.networkIdsFrom(document)),
        ),
      ],
    );
  }

  private async putCallHeads(
    documents: Record<string, unknown>[],
  ): Promise<void> {
    for (const document of documents) {
      const callId = this.stringValue(document, 'id');

      if (!callId) {
        continue;
      }

      await this.registry.putHead(
        `call:${callId}`,
        { ...document },
        this.networkIdsFrom(document),
      );
    }
  }

  private async repairActiveCallIndex(
    activeDocuments: Record<string, unknown>[],
  ): Promise<number> {
    await this.registry.putHead(
      'call-active-index',
      {
        calls: this.deduplicateById(activeDocuments).map((document) => ({
          ...document,
        })),
        id: 'call-active-index',
        updatedAt: Date.now(),
      },
      [
        ...new Set(
          activeDocuments.flatMap((document) => this.networkIdsFrom(document)),
        ),
      ],
    );

    return 1;
  }

  private participantCallGroups(
    documents: Record<string, unknown>[],
  ): Map<string, Record<string, unknown>[]> {
    const grouped = new Map<string, Record<string, unknown>[]>();

    for (const document of documents) {
      for (const participantId of this.stringArrayValue(
        document,
        'participantIds',
      )) {
        grouped.set(participantId, [
          ...(grouped.get(participantId) || []),
          document,
        ]);
      }
    }

    return grouped;
  }

  private async repairParticipantCallIndexes(
    groups: Map<string, Record<string, unknown>[]>,
  ): Promise<number> {
    for (const [participantId, callDocuments] of groups) {
      await this.putCallIndex(
        `call-participant-index:${participantId}`,
        'participantId',
        participantId,
        callDocuments,
      );
    }

    return groups.size;
  }

  private scopeValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const scope = document.scope;

    return this.isRecord(scope)
      ? this.stringValue(scope, attribute)
      : undefined;
  }

  private async repairConversationCallIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const groups = this.groupDocumentsBy(documents, (document) =>
      this.scopeValue(document, 'conversationId'),
    );

    for (const [conversationId, callDocuments] of groups) {
      await this.putCallIndex(
        `call-conversation-index:${conversationId}`,
        'conversationId',
        conversationId,
        callDocuments,
      );
    }

    return groups.size;
  }

  private communityChannelCallGroupKey(
    document: Record<string, unknown>,
  ): string | undefined {
    const communityId = this.scopeValue(document, 'communityId');
    const channelId = this.scopeValue(document, 'channelId');

    return communityId && channelId ? `${communityId}:${channelId}` : undefined;
  }

  private async repairCommunityChannelCallIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const groups = this.groupDocumentsBy(documents, (document) =>
      this.communityChannelCallGroupKey(document),
    );
    let repairedIndexes = 0;

    for (const [keyParts, callDocuments] of groups) {
      const [communityId, channelId] = keyParts.split(':');

      if (!communityId || !channelId) {
        continue;
      }

      const key = `call-community-channel-index:${communityId}:${channelId}`;

      await this.registry.putHead(
        key,
        {
          calls: this.deduplicateById(callDocuments).map((document) => ({
            ...document,
          })),
          channelId,
          communityId,
          id: key,
          updatedAt: Date.now(),
        },
        [
          ...new Set(
            callDocuments.flatMap((document) => this.networkIdsFrom(document)),
          ),
        ],
      );
      repairedIndexes += 1;
    }

    return repairedIndexes;
  }

  private async repairActiveCommunityCallIndexes(
    activeDocuments: Record<string, unknown>[],
  ): Promise<number> {
    const groups = this.groupDocumentsBy(activeDocuments, (document) =>
      this.scopeValue(document, 'communityId'),
    );

    for (const [communityId, callDocuments] of groups) {
      await this.putCallIndex(
        `call-community-active-index:${communityId}`,
        'communityId',
        communityId,
        callDocuments,
      );
    }

    return groups.size;
  }

  private async repairCallIndexes(
    documents: Record<string, unknown>[],
  ): Promise<number> {
    const activeDocuments = documents.filter(
      (document) => this.stringValue(document, 'status') === 'active',
    );

    await this.putCallHeads(documents);

    const repairedIndexes = await Promise.all([
      this.repairActiveCallIndex(activeDocuments),
      this.repairParticipantCallIndexes(this.participantCallGroups(documents)),
      this.repairConversationCallIndexes(documents),
      this.repairCommunityChannelCallIndexes(documents),
      this.repairActiveCommunityCallIndexes(activeDocuments),
    ]);

    return repairedIndexes.reduce((total, count) => total + count, 0);
  }

  private async repairPresenceHeads(): Promise<number> {
    const documents = await this.queryRepairDocuments(
      'presence',
      (document) =>
        Boolean(this.stringValue(document, 'identityId')) &&
        Boolean(this.stringValue(document, 'status')) &&
        typeof document.updatedAt === 'number',
      'OrbitDBMetadataHeadRepairer.repairPresenceHeads',
    );

    for (const document of documents) {
      const identityId = this.stringValue(document, 'identityId');

      if (!identityId) {
        continue;
      }

      await this.registry.putHead(`presence:${identityId}`, { ...document });
    }

    return documents.length;
  }

  private async repairNotificationIndexes(): Promise<number> {
    const documents = await this.queryRepairDocuments(
      'notifications',
      (document) =>
        Boolean(this.stringValue(document, 'id')) &&
        Boolean(this.stringValue(document, 'recipientIdentityId')) &&
        typeof document.createdAt === 'number' &&
        this.isRecord(document.payload),
      'OrbitDBMetadataHeadRepairer.repairNotificationIndexes',
    );
    const grouped = this.groupDocumentsBy(documents, (document) =>
      this.stringValue(document, 'recipientIdentityId'),
    );

    for (const document of documents) {
      const notificationId = this.stringValue(document, 'id');

      if (notificationId) {
        await this.registry.putHead(`notification:${notificationId}`, {
          ...document,
        });
      }
    }

    for (const [recipientIdentityId, notificationDocuments] of grouped) {
      const key = `notification-recipient-index:${recipientIdentityId}`;

      await this.registry.putHead(key, {
        id: key,
        notifications: this.deduplicateById(notificationDocuments).map(
          (document) => ({ ...document }),
        ),
        recipientIdentityId,
        updatedAt: Date.now(),
      });
    }

    return grouped.size;
  }

  private async repairCallStore(): Promise<Partial<RepairResult>> {
    return {
      callIndexes: await this.repairCallIndexes(await this.findCallDocuments()),
    };
  }

  private async repairConversationStore(): Promise<Partial<RepairResult>> {
    const conversationHeads = await this.repairConversationHeads();

    return {
      conversationParticipantIndexes: conversationHeads.participantIndexes,
      conversations: conversationHeads.conversations,
    };
  }

  private async repairMessageStore(): Promise<Partial<RepairResult>> {
    const communityChannelMessages =
      await this.findLiveCommunityChannelMessageDocuments();
    const conversationMessages =
      await this.findLiveConversationMessageDocuments();
    const [
      communityChannelMessageIndexes,
      communityThreadSummaries,
      conversationMessageIndexes,
    ] = await Promise.all([
      this.repairCommunityChannelMessageIndexes(communityChannelMessages),
      this.repairCommunityThreadSummaryHeads(communityChannelMessages),
      this.repairConversationMessageIndexes(conversationMessages),
    ]);

    return {
      communityChannelMessageIndexes,
      communityThreadSummaries,
      conversationMessageIndexes,
    };
  }

  private async repairPinStore(): Promise<Partial<RepairResult>> {
    const pins = await this.findLivePinDocuments();
    const [communityChannelPinIndexes, conversationPinIndexes] =
      await Promise.all([
        this.repairCommunityChannelPinIndexes(pins),
        this.repairConversationPinIndexes(pins),
      ]);

    return {
      communityChannelPinIndexes,
      conversationPinIndexes,
    };
  }

  private async repairPollStore(): Promise<Partial<RepairResult>> {
    return {
      pollIndexes: await this.repairPollIndexes(await this.findPollDocuments()),
    };
  }

  private async repairReactionStore(): Promise<Partial<RepairResult>> {
    return {
      reactionIndexes: await this.repairReactionIndexes(
        await this.findLiveReactionDocuments(),
      ),
    };
  }

  private repairersByStoreName(): Partial<
    Record<
      OrbitDBReplicatedDocumentStoreName,
      () => Promise<Partial<RepairResult>>
    >
  > {
    return {
      calls: () => this.repairCallStore(),
      communities: async () => ({
        communities: await this.repairCommunityHeads(),
      }),
      conversations: () => this.repairConversationStore(),
      identities: async () => ({
        identities: await this.repairIdentityHeads(),
      }),
      keychains: async () => ({
        keychains: await this.repairKeychainHeads(),
      }),
      messages: () => this.repairMessageStore(),
      notifications: async () => ({
        notificationIndexes: await this.repairNotificationIndexes(),
      }),
      pins: () => this.repairPinStore(),
      polls: () => this.repairPollStore(),
      presence: async () => ({
        presenceHeads: await this.repairPresenceHeads(),
      }),
      reactions: () => this.repairReactionStore(),
    };
  }

  public async repairCritical(): Promise<CriticalRepairResult> {
    const conversationHeads = await this.repairConversationHeads();
    const [
      communities,
      identities,
      keychains,
      notificationIndexes,
      presenceHeads,
    ] = await Promise.all([
      this.repairCommunityHeads(),
      this.repairIdentityHeads(),
      this.repairKeychainHeads(),
      this.repairNotificationIndexes(),
      this.repairPresenceHeads(),
    ]);

    return {
      communities,
      conversationParticipantIndexes: conversationHeads.participantIndexes,
      conversations: conversationHeads.conversations,
      identities,
      keychains,
      notificationIndexes,
      presenceHeads,
    };
  }

  public async repairSecondary(): Promise<SecondaryRepairResult> {
    const communityChannelMessages =
      await this.findLiveCommunityChannelMessageDocuments();
    const conversationMessages =
      await this.findLiveConversationMessageDocuments();
    const pins = await this.findLivePinDocuments();
    const reactions = await this.findLiveReactionDocuments();
    const polls = await this.findPollDocuments();
    const calls = await this.findCallDocuments();
    const [
      callIndexes,
      communityChannelPinIndexes,
      conversationMessageIndexes,
      conversationPinIndexes,
      pollIndexes,
      reactionIndexes,
      communityThreadSummaries,
      communityChannelMessageIndexes,
    ] = await Promise.all([
      this.repairCallIndexes(calls),
      this.repairCommunityChannelPinIndexes(pins),
      this.repairConversationMessageIndexes(conversationMessages),
      this.repairConversationPinIndexes(pins),
      this.repairPollIndexes(polls),
      this.repairReactionIndexes(reactions),
      this.repairCommunityThreadSummaryHeads(communityChannelMessages),
      this.repairCommunityChannelMessageIndexes(communityChannelMessages),
    ]);

    return {
      callIndexes,
      communityChannelMessageIndexes,
      communityChannelPinIndexes,
      communityThreadSummaries,
      conversationMessageIndexes,
      conversationPinIndexes,
      pollIndexes,
      reactionIndexes,
    };
  }

  public repairStore(
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): Promise<Partial<RepairResult>> {
    return this.repairersByStoreName()[storeName]?.() ?? Promise.resolve({});
  }

  public async repair(): Promise<RepairResult> {
    return {
      ...(await this.repairCritical()),
      ...(await this.repairSecondary()),
    };
  }
}
