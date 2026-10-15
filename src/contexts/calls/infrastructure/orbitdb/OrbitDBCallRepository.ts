import { Call } from '@app/contexts/calls/domain/Call';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Timestamp } from '@haskou/value-objects';

import { CallRecordIds } from '../../domain/CallRecordIds';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';
import { CallPrimitives } from './CallPrimitives';
import OrbitDBCallProjection from './OrbitDBCallProjection';

export default class OrbitDBCallRepository extends CallRepository {
  /** A community call nobody holds a participation lease on is hidden after this. */
  private static readonly COMMUNITY_LEASE_GRACE_MS = 60_000;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly callProjection: OrbitDBCallProjection,
    private readonly leases: CallParticipantLeaseRepository,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
  }

  private async hydrate(document: CallPrimitives): Promise<Call> {
    const call = Call.fromPrimitives(document);

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

      if (
        call.isActive() &&
        ids.size === 0 &&
        Date.now() - call.toPrimitives().createdAt >
          OrbitDBCallRepository.COMMUNITY_LEASE_GRACE_MS
      ) {
        call.expire(Timestamp.now());
      }
    }

    return call;
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

  private hydrateList(documents: CallPrimitives[]): Promise<Call[]> {
    return Promise.all(documents.map((document) => this.hydrate(document)));
  }

  private async hydrateIfPublic(
    document: CallPrimitives,
  ): Promise<Call | undefined> {
    const communityId =
      document.scope.type === 'community_channel' &&
      typeof document.scope.communityId === 'string'
        ? new CommunityId(document.scope.communityId)
        : undefined;

    if (!communityId) return this.hydrate(document);

    try {
      return await this.publicStorageGuard.runWhilePublic(communityId, () =>
        this.hydrate(document),
      );
    } catch (error: unknown) {
      if (error instanceof InvalidPrivateAuthorizationError) return undefined;

      throw error;
    }
  }

  private async hydratePublicList(
    documents: CallPrimitives[],
  ): Promise<Call[]> {
    const calls = await Promise.all(
      documents.map((document) => this.hydrateIfPublic(document)),
    );

    return calls.filter((call): call is Call => call !== undefined);
  }

  private participantRecord(
    call: Call,
    identityId: IdentityId,
    at: Timestamp,
  ): Record<string, unknown> {
    const status = call
      .toPrimitives()
      .participants.find(
        (candidate) => candidate.identityId === identityId.valueOf(),
      )?.status;

    return {
      at: at.valueOf(),
      callId: call.getId().valueOf(),
      id: CallRecordIds.participant(
        call.getId().valueOf(),
        identityId.valueOf(),
      ),
      identityId: identityId.valueOf(),
      scopeType: 'call_participant',
      state: status === 'joined' || status === 'declined' ? status : 'left',
    };
  }

  private startRecord(call: Call): Record<string, unknown> {
    const primitives = call.toPrimitives();
    const scope = primitives.scope;

    return {
      callId: primitives.id,
      creatorIdentityId: primitives.creatorIdentityId,
      id: CallRecordIds.start(primitives.id),
      networkId: primitives.networkId,
      nonce: primitives.nonce,
      participantIds: call.getScope().isCommunityChannel()
        ? []
        : [...primitives.participantIds].sort(),
      scope: call.getScope().isCommunityChannel()
        ? {
            channelId: scope.channelId,
            communityId: scope.communityId,
            type: scope.type,
          }
        : { conversationId: scope.conversationId, type: scope.type },
      scopeType: 'call_start',
      ...(primitives.sessionEpoch === undefined
        ? {}
        : { sessionEpoch: primitives.sessionEpoch }),
      startedAt: primitives.createdAt,
    };
  }

  private endRecord(call: Call): Record<string, unknown> {
    const primitives = call.toPrimitives();

    return {
      at: primitives.endedAt,
      callId: primitives.id,
      endedByIdentityId: primitives.endedByIdentityId,
      id: CallRecordIds.end(primitives.id),
      scopeType: 'call_end',
    };
  }

  private async put(
    call: Call,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.runWhilePublicCommunityScope(call, async () => {
      const document = PublicMutationRecord.withProof(payload, proof);

      PublicMutationRecord.assertNotStale(
        await this.registry.queryDocuments(
          'calls',
          (stored) =>
            stored.scopeType === payload.scopeType && stored.id === payload.id,
        ),
        document,
      );
      await this.registry.putDocument('calls', document);
    });
  }

  /**
   * Community participants are never stored: the roster is the lease set and
   * the signed join or leave is only admitted here, so nothing is replicated.
   */
  private async admit(
    call: Call,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.runWhilePublicCommunityScope(call, () =>
      this.registry.admitDocument(
        'calls',
        PublicMutationRecord.withProof(payload, proof),
      ),
    );
  }

  private async findCallById(id: CallId): Promise<Call | undefined> {
    const document = await this.callProjection.findById(id);

    if (!document) return undefined;
    const initialScope = Call.fromPrimitives(document).getScope();
    const communityId = initialScope.getCommunityId();
    const read = async (): Promise<Call | undefined> => {
      const lockedDocument = await this.callProjection.findById(id);

      if (!lockedDocument) return undefined;
      const lockedScope = Call.fromPrimitives(lockedDocument).getScope();

      return lockedScope.isEqual(initialScope)
        ? this.hydrate(lockedDocument)
        : undefined;
    };

    return communityId
      ? this.publicStorageGuard.runWhilePublic(communityId, read)
      : read();
  }

  private async findActiveCallByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined> {
    const call = await this.publicStorageGuard.runWhilePublic(
      communityId,
      async () => {
        const document = await this.callProjection.findActiveByCommunityChannel(
          communityId,
          channelId,
        );

        return document ? this.hydrate(document) : undefined;
      },
    );

    return call?.isActive() ? call : undefined;
  }

  public async hasById(id: CallId): Promise<boolean> {
    return (await this.findCallById(id)) !== undefined;
  }

  /**
   * A node that just restarted replays the call records before the
   * authorization they rest on has loaded from its peers, so it holds the
   * start of a live call without having admitted it yet; or it could not
   * replay the call history yet because a block was missing locally. That
   * call is not missing: the caller is told to retry instead of ending it.
   */
  public async requireById(id: CallId): Promise<Call> {
    const call = await this.findCallById(id);

    if (call) return call;

    if (
      this.registry.isSubscriberBootstrapDeferred('calls') ||
      this.registry.isDocumentPendingAdmission(
        'calls',
        CallRecordIds.start(id.valueOf()),
      )
    )
      throw new ReplicatedStateNotReadyError();

    throw new CallNotFoundError();
  }

  public assertParticipantSettled(
    callId: CallId,
    identityId: IdentityId,
  ): Promise<void> {
    if (
      this.registry.isSubscriberBootstrapDeferred('calls') ||
      this.registry.isDocumentPendingAdmission(
        'calls',
        CallRecordIds.participant(callId.valueOf(), identityId.valueOf()),
      )
    )
      return Promise.reject(new ReplicatedStateNotReadyError());

    return Promise.resolve();
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    const [conversations, communities] = await Promise.all([
      this.callProjection.findActiveByParticipant(participantId),
      this.callProjection.findActiveCommunityCalls(),
    ]);
    const calls = await this.hydratePublicList([
      ...conversations,
      ...communities,
    ]);

    return calls.filter(
      (call) => call.isActive() && call.hasParticipant(participantId),
    );
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.hydratePublicList(
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
    return this.publicStorageGuard.runWhilePublic(communityId, async () =>
      this.hydrateList(
        await this.callProjection.findByCommunityChannel(
          communityId,
          channelId,
        ),
      ),
    );
  }

  public async hasActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<boolean> {
    const call = await this.findActiveCallByCommunityChannel(
      communityId,
      channelId,
    );

    return call !== undefined;
  }

  public async requireActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call> {
    const call = await this.findActiveCallByCommunityChannel(
      communityId,
      channelId,
    );

    if (!call) {
      throw new CallNotFoundError();
    }

    return call;
  }

  public async findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () =>
      (
        await this.hydrateList(
          await this.callProjection.findActiveByCommunity(communityId),
        )
      ).filter((call) => call.isActive()),
    );
  }

  public async findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]> {
    return this.hydratePublicList(
      await this.callProjection.findTimedOutRingingCalls(timeoutThreshold),
    );
  }

  public saveStart(call: Call, proof: PublicMutationProof): Promise<void> {
    return this.put(call, this.startRecord(call), proof);
  }

  public saveParticipant(
    call: Call,
    identityId: IdentityId,
    at: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    const payload = this.participantRecord(call, identityId, at);

    if (call.getScope().isCommunityChannel()) {
      return this.admit(call, payload, proof);
    }

    return this.put(call, payload, proof);
  }

  public saveEnd(call: Call, proof: PublicMutationProof): Promise<void> {
    return this.put(call, this.endRecord(call), proof);
  }

  public awaitUpdate(id: CallId, timeoutMs: number): Promise<boolean> {
    return this.callProjection.awaitUpdate(id, timeoutMs);
  }

  public markTimedOut(call: Call): Promise<void> {
    this.callProjection.markTimedOut(
      call.getId(),
      call.toPrimitives().endedAt ?? Date.now(),
    );

    return Promise.resolve();
  }
}
