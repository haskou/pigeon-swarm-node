import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollId } from '../../domain/value-objects/PollId';
import { OrbitDBPollDocument } from './documents/OrbitDBPollDocument';

export default class OrbitDBPollRepository extends PollRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
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
    return (
      this.hasPollIdentityFields(document) &&
      this.hasPollConfigurationFields(document) &&
      this.hasPollScopeField(document)
    );
  }

  private toDocument(poll: Poll): OrbitDBPollDocument {
    const primitives = poll.toPrimitives();

    return {
      allowsMultipleVotes: primitives.allowsMultipleVotes,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      expiresAt: primitives.expiresAt,
      id: primitives.id,
      networkId: primitives.scope.networkId,
      options: primitives.options,
      question: primitives.question,
      scope: primitives.scope,
      status: primitives.status,
      updatedAt: Date.now(),
      votes: primitives.votes,
    };
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

  private deduplicateDocuments(
    documents: OrbitDBPollDocument[],
  ): OrbitDBPollDocument[] {
    const deduplicated = new Map<string, OrbitDBPollDocument>();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || this.freshness(current) <= this.freshness(document)) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
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

  private documentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBPollDocument[] | undefined {
    if (!record) {
      return undefined;
    }

    const polls = record.polls;

    if (!Array.isArray(polls)) {
      return [];
    }

    return polls
      .filter(
        (poll): poll is Record<string, unknown> =>
          typeof poll === 'object' && poll !== null && !Array.isArray(poll),
      )
      .filter((poll): poll is OrbitDBPollDocument => this.isDocument(poll));
  }

  private async putIndex(
    key: string,
    documents: OrbitDBPollDocument[],
  ): Promise<void> {
    const polls = this.deduplicateDocuments(documents);
    const networkIds = [...new Set(polls.map((poll) => poll.networkId))];

    await this.registry.putHead(
      key,
      {
        id: key,
        polls: polls.map((poll) => ({ ...poll })),
        updatedAt: Date.now(),
      },
      networkIds,
    );
  }

  private async putIndexDocument(
    key: string,
    document: OrbitDBPollDocument,
  ): Promise<void> {
    await this.putIndex(key, [
      ...(this.documentsFromIndex(await this.registry.findHead(key)) || []),
      document,
    ]);
  }

  private async putHeads(document: OrbitDBPollDocument): Promise<void> {
    await this.registry.putHead(
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

    return head && this.isDocument(head) ? this.toDomain(head) : undefined;
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const key = this.communityChannelIndexHeadKey(
      communityId.valueOf(),
      channelId.valueOf(),
    );
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
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
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
    const documents = indexedDocuments ?? [];

    return this.sortDocuments(documents)
      .filter((document) =>
        beforeCreatedAt ? document.createdAt <= beforeCreatedAt : true,
      )
      .slice(0, limit)
      .map((document) => this.toDomain(document));
  }

  public async save(poll: Poll): Promise<void> {
    const document = this.toDocument(poll);

    await this.registry.putDocument('polls', document);
    await this.putHeads(document);
  }
}
