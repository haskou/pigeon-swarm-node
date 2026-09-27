import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollId } from '../../domain/value-objects/PollId';
import { OrbitDBPollDocument } from './documents/OrbitDBPollDocument';

export default class OrbitDBPollRepository extends PollRepository {
  private readonly pollIndex: OrbitDBHeadIndex<OrbitDBPollDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly communityRepository: CommunityRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.pollIndex = new OrbitDBHeadIndex(this.registry, {
      belongsToCanonicalIndex: (key, record) =>
        this.isDocument(record) && this.belongsToIndex(key, record),
      canonicalStoreName: 'polls',
      collectionName: 'polls',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
  }

  private hasPollIdentityFields(document: Record<string, unknown>): boolean {
    return (
      typeof document.id === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.creatorIdentityId === 'string' &&
      typeof document.networkId === 'string'
    );
  }

  private hasPollConfigurationFields(
    document: Record<string, unknown>,
  ): boolean {
    return (
      typeof document.allowsMultipleVotes === 'boolean' &&
      Array.isArray(document.options) &&
      typeof document.question === 'string' &&
      typeof document.status === 'string' &&
      Array.isArray(document.votes)
    );
  }

  private hasPollScopeField(document: Record<string, unknown>): boolean {
    return typeof document.scope === 'object' && document.scope !== null;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBPollDocument {
    const hasRequiredFields =
      this.hasPollIdentityFields(document) &&
      this.hasPollConfigurationFields(document) &&
      this.hasPollScopeField(document);

    if (!hasRequiredFields) return false;
    const candidate = document as OrbitDBPollDocument;

    try {
      const poll = this.toDomain(candidate);
      poll.getScope().match<void>({
        communityChannel: () => undefined,
        groupConversation: () => undefined,
      });

      return (
        poll.getId().valueOf() === candidate.id &&
        poll.getCreatorIdentityId().valueOf() === candidate.creatorIdentityId
      );
    } catch {
      return false;
    }
  }

  private async resolveNetworkId(poll: Poll): Promise<string> {
    return poll.getScope().match<Promise<string>>({
      communityChannel: async (communityId) => {
        const community = await this.communityRepository.findById(communityId);

        if (!community) {
          throw new CommunityNotFoundError();
        }

        return community.toPrimitives().networkId;
      },
      groupConversation: async (conversationId) => {
        const conversation =
          await this.conversationRepository.findMetadataById(conversationId);

        if (!conversation) {
          throw new ConversationNotFoundError(conversationId);
        }

        return conversation.toPrimitives().networkId;
      },
    });
  }

  private async toDocument(poll: Poll): Promise<OrbitDBPollDocument> {
    const primitives = poll.toPrimitives();
    const networkId = await this.resolveNetworkId(poll);

    return {
      allowsMultipleVotes: primitives.allowsMultipleVotes,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      expiresAt: primitives.expiresAt,
      id: primitives.id,
      networkId,
      options: primitives.options,
      question: primitives.question,
      scope: primitives.scope,
      status: primitives.status,
      updatedAt: Date.now(),
      votes: primitives.votes,
    };
  }

  private async assertPublicCommunityScope(poll: Poll): Promise<void> {
    await poll.getScope().match<Promise<void>>({
      communityChannel: (communityId) =>
        this.publicStorageGuard.assertPublic(communityId),
      groupConversation: () => Promise.resolve(),
    });
  }

  private runWhilePublicCommunityScope<T>(
    poll: Poll,
    action: () => Promise<T>,
  ): Promise<T> {
    return poll.getScope().match<Promise<T>>({
      communityChannel: (communityId) =>
        this.publicStorageGuard.runWhilePublic(communityId, action),
      groupConversation: action,
    });
  }

  private toDomain(document: OrbitDBPollDocument): Poll {
    return Poll.fromPrimitives({
      allowsMultipleVotes: document.allowsMultipleVotes,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      expiresAt: document.expiresAt,
      id: document.id,
      options: document.options,
      question: document.question,
      scope: document.scope,
      status: document.status,
      votes: document.votes,
    });
  }

  private freshness(document: OrbitDBPollDocument): number {
    return Math.max(document.updatedAt ?? 0, document.createdAt);
  }

  private pollHeadKey(pollId: string): string {
    return `poll:${pollId}`;
  }

  private communityChannelIndexHeadKey(
    communityId: string,
    channelId: string,
  ): string {
    return `poll-community-channel-index:${communityId}:${channelId}`;
  }

  private groupConversationIndexHeadKey(conversationId: string): string {
    return `poll-group-conversation-index:${conversationId}`;
  }

  private belongsToIndex(key: string, document: OrbitDBPollDocument): boolean {
    if (document.scope.type === 'community_channel') {
      return (
        key ===
        this.communityChannelIndexHeadKey(
          document.scope.communityId ?? '',
          document.scope.channelId ?? '',
        )
      );
    }

    return (
      document.scope.type === 'group_conversation' &&
      key ===
        this.groupConversationIndexHeadKey(document.scope.conversationId ?? '')
    );
  }

  private async putIndexDocument(
    key: string,
    document: OrbitDBPollDocument,
  ): Promise<void> {
    await this.pollIndex.putRecord(
      key,
      { id: key },
      document,
      [document.networkId],
      {
        recordFilter: (candidate) => {
          const poll = this.isDocument(candidate) ? candidate : undefined;

          return poll !== undefined && this.belongsToIndex(key, poll);
        },
        replace: true,
      },
    );
  }

  private async putHeads(document: OrbitDBPollDocument): Promise<void> {
    await this.registry.putHeadExactly(
      this.pollHeadKey(document.id),
      { ...document },
      [document.networkId],
    );

    if (
      document.scope.type === 'community_channel' &&
      document.scope.communityId &&
      document.scope.channelId
    ) {
      await this.putIndexDocument(
        this.communityChannelIndexHeadKey(
          document.scope.communityId,
          document.scope.channelId,
        ),
        document,
      );
    }

    if (
      document.scope.type === 'group_conversation' &&
      document.scope.conversationId
    ) {
      await this.putIndexDocument(
        this.groupConversationIndexHeadKey(document.scope.conversationId),
        document,
      );
    }
  }

  private sortDocuments(
    documents: OrbitDBPollDocument[],
  ): OrbitDBPollDocument[] {
    return [...documents].sort((left, right) => {
      if (left.createdAt === right.createdAt) {
        return right.id.localeCompare(left.id);
      }

      return right.createdAt - left.createdAt;
    });
  }

  public async findById(id: PollId): Promise<Poll | undefined> {
    const head = await this.registry.findHead(this.pollHeadKey(id.valueOf()));
    const poll =
      head && this.isDocument(head) ? this.toDomain(head) : undefined;

    if (poll) await this.assertPublicCommunityScope(poll);

    return poll;
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    await this.publicStorageGuard.assertPublic(communityId);
    const key = this.communityChannelIndexHeadKey(
      communityId.valueOf(),
      channelId.valueOf(),
    );
    const indexedDocuments = await this.pollIndex.find(key);
    const documents = indexedDocuments ?? [];

    return this.sortDocuments(documents)
      .filter((document) =>
        beforeCreatedAt ? document.createdAt <= beforeCreatedAt : true,
      )
      .slice(0, limit)
      .map((document) => this.toDomain(document));
  }

  public async findByGroupConversation(
    conversationId: ConversationId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const key = this.groupConversationIndexHeadKey(conversationId.valueOf());
    const indexedDocuments = await this.pollIndex.find(key);
    const documents = indexedDocuments ?? [];

    return this.sortDocuments(documents)
      .filter((document) =>
        beforeCreatedAt ? document.createdAt <= beforeCreatedAt : true,
      )
      .slice(0, limit)
      .map((document) => this.toDomain(document));
  }

  public async save(poll: Poll): Promise<void> {
    await this.runWhilePublicCommunityScope(poll, async () => {
      const document = await this.toDocument(poll);

      await this.registry.putDocument('polls', document);
      await this.putHeads(document);
    });
  }
}
