import { Call } from '@app/contexts/calls/domain/Call';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallRepository extends CallRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private hasCallIdentityFields(document: Record<string, unknown>): boolean {
    return (
      typeof document.id === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.creatorIdentityId === 'string' &&
      typeof document.networkId === 'string'
    );
  }

  private hasCallStateFields(document: Record<string, unknown>): boolean {
    return (
      Array.isArray(document.participantIds) &&
      Array.isArray(document.participants) &&
      typeof document.scope === 'object' &&
      document.scope !== null &&
      typeof document.status === 'string'
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCallDocument {
    return (
      this.hasCallIdentityFields(document) && this.hasCallStateFields(document)
    );
  }

  private toDocument(call: Call): OrbitDBCallDocument {
    const primitives = call.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      endedByIdentityId: primitives.endedByIdentityId,
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      participants: primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
    };
  }

  private toDomain(document: OrbitDBCallDocument): Call {
    return Call.fromPrimitives({
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      endedAt: document.endedAt,
      endedByIdentityId: document.endedByIdentityId,
      id: document.id,
      networkId: document.networkId,
      participantIds: document.participantIds,
      participants: document.participants,
      scope: document.scope,
      status: document.status,
    });
  }

  private async findDocuments(
    matcher: (document: OrbitDBCallDocument) => boolean,
  ): Promise<OrbitDBCallDocument[]> {
    const documents = await this.registry.queryDocuments(
      'calls',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents
      .filter((document): document is OrbitDBCallDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const [document] = await this.findDocuments((candidate) =>
      new CallId(candidate.id).isEqual(id),
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.status === 'active' &&
        document.participants.some(
          (participant) =>
            participant.identityId === participantId.valueOf() &&
            ['joined', 'ringing'].includes(participant.status),
        ),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    const documents = await this.findDocuments((document) =>
      document.participantIds.includes(participantId.valueOf()),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.scope.type === 'conversation' &&
        document.scope.conversationId === conversationId.valueOf(),
    );

    return documents
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.scope.type === 'community_channel' &&
        document.scope.communityId === communityId.valueOf() &&
        document.scope.channelId === channelId.valueOf(),
    );

    return documents
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    const [document] = await this.findDocuments(
      (candidate) =>
        candidate.status === 'active' &&
        candidate.scope.type === 'community_channel' &&
        candidate.scope.communityId === communityId.valueOf() &&
        candidate.scope.channelId === channelId.valueOf(),
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.status === 'active' &&
        document.scope.type === 'community_channel' &&
        document.scope.communityId === communityId.valueOf(),
    );

    return documents
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.toDomain(document));
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.status === 'active' &&
        document.createdAt <= timeoutThreshold.valueOf() &&
        document.participants.some(
          (participant) => participant.status === 'ringing',
        ),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async findTimedOutJoinedCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    const documents = await this.findDocuments(
      (document) =>
        document.status === 'active' &&
        document.participants.some(
          (participant) =>
            participant.status === 'joined' &&
            participant.lastSeenAt !== undefined &&
            participant.lastSeenAt <= timeoutThreshold.valueOf(),
        ),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async save(call: Call): Promise<void> {
    await this.registry.putDocument('calls', this.toDocument(call));
  }
}
