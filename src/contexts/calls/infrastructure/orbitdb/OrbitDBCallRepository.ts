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
import OrbitDBCallIndex from './OrbitDBCallIndex';

export default class OrbitDBCallRepository extends CallRepository {
  constructor(
    private readonly mapper: OrbitDBCallMapper,
    private readonly documentReplicator: OrbitDBCallDocumentReplicator,
    private readonly callIndex: OrbitDBCallIndex,
  ) {
    super();
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const document = await this.callIndex.findById(id);

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callIndex.findActiveByParticipant(participantId),
    );
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callIndex.findByParticipant(participantId),
    );
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callIndex.findByConversationId(conversationId),
    );
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callIndex.findByCommunityChannel(communityId, channelId),
    );
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    const document = await this.callIndex.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callIndex.findActiveByCommunity(communityId),
    );
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    return this.mapper.toDomainList(
      await this.callIndex.findTimedOutRingingCalls(timeoutThreshold),
    );
  }

  public save(call: Call): Promise<void> {
    const document = this.mapper.toDocument(call);

    this.documentReplicator.replicate(document);
    this.callIndex.put(document);

    return Promise.resolve();
  }

  public registerReplica(call: Call): Promise<void> {
    const document = this.mapper.toDocument(call);

    this.callIndex.registerReplica({
      ...document,
      updatedAt: document.createdAt,
    });

    return Promise.resolve();
  }
}
