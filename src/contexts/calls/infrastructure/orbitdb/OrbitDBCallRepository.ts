import { Call } from '@app/contexts/calls/domain/Call';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import OrbitDBCallMapper from './mappers/OrbitDBCallMapper';
import OrbitDBCallDocumentReplicator from './OrbitDBCallDocumentReplicator';
import OrbitDBCallProjection from './OrbitDBCallProjection';

export default class OrbitDBCallRepository extends CallRepository {
  constructor(
    private readonly mapper: OrbitDBCallMapper,
    private readonly documentReplicator: OrbitDBCallDocumentReplicator,
    private readonly callProjection: OrbitDBCallProjection,
  ) {
    super();
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const document = await this.callProjection.findById(id);

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callProjection.findActiveByParticipant(participantId),
    );
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callProjection.findByParticipant(participantId),
    );
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callProjection.findByConversationId(conversationId),
    );
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callProjection.findByCommunityChannel(communityId, channelId),
    );
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    const document = await this.callProjection.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callProjection.findActiveByCommunity(communityId),
    );
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callProjection.findTimedOutRingingCalls(timeoutThreshold),
    );
  }

  public save(call: Call): Promise<void> {
    const document = this.mapper.toDocument(call);

    this.documentReplicator.replicate(document);
    this.callProjection.project(document);

    return Promise.resolve();
  }

  public registerReplica(call: Call): Promise<void> {
    const document = this.mapper.toDocument(call);

    this.callProjection.project({
      ...document,
      updatedAt: document.createdAt,
    });

    return Promise.resolve();
  }
}
