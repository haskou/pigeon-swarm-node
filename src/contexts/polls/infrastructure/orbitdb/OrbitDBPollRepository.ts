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

  private async findDocuments(
    matcher: (document: OrbitDBPollDocument) => boolean,
    limit?: number,
  ): Promise<OrbitDBPollDocument[]> {
    const documents = await this.registry.queryDocuments(
      'polls',
      (document) => this.isDocument(document) && matcher(document),
    );

    const sorted = documents
      .filter((document): document is OrbitDBPollDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => {
        if (left.createdAt === right.createdAt) {
          return right.id.localeCompare(left.id);
        }

        return right.createdAt - left.createdAt;
      });

    return limit ? sorted.slice(0, limit) : sorted;
  }

  public async findById(id: PollId): Promise<Poll | undefined> {
    const [document] = await this.findDocuments((candidate) =>
      new PollId(candidate.id).isEqual(id),
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.scope.type === 'community_channel' &&
        document.scope.communityId === communityId.valueOf() &&
        document.scope.channelId === channelId.valueOf() &&
        (!beforeCreatedAt || document.createdAt <= beforeCreatedAt),
      limit,
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async findByGroupConversation(
    conversationId: ConversationId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.scope.type === 'group_conversation' &&
        document.scope.conversationId === conversationId.valueOf() &&
        (!beforeCreatedAt || document.createdAt <= beforeCreatedAt),
      limit,
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async save(poll: Poll): Promise<void> {
    await this.registry.putDocument('polls', this.toDocument(poll));
  }
}
