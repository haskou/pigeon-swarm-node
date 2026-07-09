import { Call } from '@app/contexts/calls/domain/Call';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';
import OrbitDBCallIndex from './OrbitDBCallIndex';

export default class OrbitDBCallRepository extends CallRepository {
  private readonly callIndex: OrbitDBCallIndex;
  private readonly callDocumentReplicationQueues = new Map<
    string,
    Promise<void>
  >();

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.callIndex = new OrbitDBCallIndex(this.registry);
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
      updatedAt: Date.now(),
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

  private toDomainList(documents: OrbitDBCallDocument[]): Call[] {
    return documents.map((document) => this.toDomain(document));
  }

  private replicateDocumentInBackground(document: OrbitDBCallDocument): void {
    const previous =
      this.callDocumentReplicationQueues.get(document.id) ?? Promise.resolve();
    const next = previous
      .catch((): void => undefined)
      .then(() =>
        this.registry.putDocument('calls', document, [document.networkId]),
      )
      .catch((error) => {
        Kernel.logger.warn?.(
          `Call document replication failed: callId=${document.id} error=${String(error)}`,
        );
      });

    this.callDocumentReplicationQueues.set(document.id, next);
    void next.finally(() => {
      if (this.callDocumentReplicationQueues.get(document.id) === next) {
        this.callDocumentReplicationQueues.delete(document.id);
      }
    });
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const document = await this.callIndex.findById(id);

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    return this.toDomainList(
      await this.callIndex.findActiveByParticipant(participantId),
    );
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.toDomainList(
      await this.callIndex.findByParticipant(participantId),
    );
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    return this.toDomainList(
      await this.callIndex.findByConversationId(conversationId),
    );
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    return this.toDomainList(
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

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    return this.toDomainList(
      await this.callIndex.findActiveByCommunity(communityId),
    );
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    return this.toDomainList(
      await this.callIndex.findTimedOutRingingCalls(timeoutThreshold),
    );
  }

  public save(call: Call): Promise<void> {
    const document = this.toDocument(call);

    this.replicateDocumentInBackground(document);
    this.callIndex.put(document);

    return Promise.resolve();
  }

  public registerReplica(call: Call): Promise<void> {
    const document = this.toDocument(call);

    this.callIndex.registerReplica({
      ...document,
      updatedAt: document.createdAt,
    });

    return Promise.resolve();
  }
}
