import { Call } from '@app/contexts/calls/domain/Call';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';
import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';
import OrbitDBCallMapper from './mappers/OrbitDBCallMapper';
import OrbitDBCallDocumentReplicator from './OrbitDBCallDocumentReplicator';
import OrbitDBCallProjection from './OrbitDBCallProjection';

export default class OrbitDBCallRepository extends CallRepository {
  constructor(
    private readonly mapper: OrbitDBCallMapper,
    private readonly documentReplicator: OrbitDBCallDocumentReplicator,
    private readonly callProjection: OrbitDBCallProjection,
    private readonly leases: CallParticipantLeaseRepository,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
  }

  private async hydrate(document: OrbitDBCallDocument): Promise<Call> {
    const call = this.mapper.toDomain(document);

    await this.assertPublicCommunityScope(call);

    if (call.getScope().isCommunityChannel()) {
      const leases = call.isActive()
        ? await this.leases.findByCallIds([call.getId()])
        : [];
      const ids = new Map<string, IdentityId>();
      for (const lease of leases.filter((candidate) =>
        candidate.hasParticipationGrant(),
      )) {
        const id = lease.getParticipantIdentityId();
        ids.set(id.valueOf(), id);
      }
      call.restoreCommunityParticipants([...ids.values()]);
    }

    return call;
  }

  private async assertPublicCommunityScope(call: Call): Promise<void> {
    const scope = call.getScope();
    const communityId = scope.getCommunityId();

    if (scope.isCommunityChannel() && communityId) {
      await this.publicStorageGuard.assertPublic(communityId);
    }
  }

  private runWhilePublicCommunityScope<T>(
    call: Call,
    action: () => Promise<T>,
  ): Promise<T> {
    const scope = call.getScope();
    const communityId = scope.getCommunityId();

    return scope.isCommunityChannel() && communityId
      ? this.publicStorageGuard.runWhilePublic(communityId, action)
      : action();
  }

  private hydrateList(documents: OrbitDBCallDocument[]): Promise<Call[]> {
    return Promise.all(documents.map((document) => this.hydrate(document)));
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const document = await this.callProjection.findById(id);

    return document ? this.hydrate(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    const [conversations, communities] = await Promise.all([
      this.callProjection.findActiveByParticipant(participantId),
      this.callProjection.findActiveCommunityCalls(),
    ]);
    const calls = await this.hydrateList([...conversations, ...communities]);

    return calls.filter((call) => call.hasParticipant(participantId));
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.hydrateList(
      await this.callProjection.findByParticipant(participantId),
    );
  }

  public async findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]> {
    return this.hydrateList(
      await this.callProjection.findByConversationId(conversationId),
    );
  }

  public async findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]> {
    await this.publicStorageGuard.assertPublic(communityId);

    return this.hydrateList(
      await this.callProjection.findByCommunityChannel(communityId, channelId),
    );
  }

  public async findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    await this.publicStorageGuard.assertPublic(communityId);
    const document = await this.callProjection.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    return document ? this.hydrate(document) : undefined;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    await this.publicStorageGuard.assertPublic(communityId);

    return this.hydrateList(
      await this.callProjection.findActiveByCommunity(communityId),
    );
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    return this.hydrateList(
      await this.callProjection.findTimedOutRingingCalls(timeoutThreshold),
    );
  }

  public async save(call: Call): Promise<void> {
    await this.runWhilePublicCommunityScope(call, async () => {
      const document = this.mapper.toDocument(call);

      this.callProjection.project(document);
      await this.documentReplicator.replicate(document);
    });
  }

  public async registerReplica(call: Call): Promise<void> {
    await this.runWhilePublicCommunityScope(call, () => {
      const document = this.mapper.toDocument(call);

      this.callProjection.project({
        ...document,
        updatedAt: document.createdAt,
      });

      return Promise.resolve();
    });
  }
}
