import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { CallRecordIds } from '../../../domain/CallRecordIds';
import { CallId } from '../../../domain/value-objects/CallId';
import { CallNonce } from '../../../domain/value-objects/CallNonce';
import { CallRecordClock } from './CallRecordClock';

/**
 * A call start is admitted only when its creator signed it, its id derives
 * from the creator and the nonce, and the signed conversation or community
 * state lets the creator call there. Conversation starts carry exactly the
 * participants of the admitted conversation; community starts carry a session
 * epoch that may exceed the known maximum of the channel by one at most.
 */
export default class CallStartMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['callId', 'creatorIdentityId', 'id', 'networkId', 'nonce'],
    ['startedAt'],
    'call_start',
    {
      arrays: ['participantIds'],
      objects: ['scope'],
      optionalIntegers: ['sessionEpoch'],
    },
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  public readonly collection = 'calls';

  public readonly scopeType = 'call_start';

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly conversationRepository: ConversationRepository,
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
  ) {
    super();
  }

  private scopeOf(record: Record<string, unknown>): Record<string, unknown> {
    return record.scope as Record<string, unknown>;
  }

  private assertScopeShape(record: Record<string, unknown>): void {
    const scope = this.scopeOf(record);
    const keys = Object.keys(scope).sort();
    const expected =
      scope.type === 'conversation'
        ? ['conversationId', 'type']
        : ['channelId', 'communityId', 'type'];

    if (
      (scope.type !== 'conversation' && scope.type !== 'community_channel') ||
      keys.join() !== expected.join() ||
      keys.some((key) => typeof scope[key] !== 'string')
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  private assertConversationFields(record: Record<string, unknown>): void {
    const participants = record.participantIds as unknown[];

    if (
      record.sessionEpoch !== undefined ||
      participants.length === 0 ||
      participants.some((participant) => typeof participant !== 'string')
    ) {
      throw new InvalidPublicMutationError();
    }

    participants.forEach(
      (participant) => new IdentityId(participant as string),
    );
  }

  private assertCommunityFields(record: Record<string, unknown>): void {
    if (
      (record.participantIds as unknown[]).length !== 0 ||
      !Number.isSafeInteger(record.sessionEpoch) ||
      (record.sessionEpoch as number) < 1
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  private async assertConversation(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    const conversationId = this.scopeOf(record).conversationId as string;
    const conversation = await this.conversations.get(conversationId, () =>
      this.conversationRepository.findMetadataById(
        new ConversationId(conversationId),
      ),
    );

    if (!conversation) throw new InvalidPublicMutationError();

    const admitted = conversation
      .getParticipantIds()
      .map((participant) => participant.valueOf())
      .sort();
    const claimed = [...(record.participantIds as string[])].sort();

    if (
      !admitted.includes(authorIdentityId) ||
      conversation.getNetworkId().valueOf() !== record.networkId ||
      admitted.length !== claimed.length ||
      admitted.some((participant, index) => participant !== claimed[index]) ||
      (!conversation.isGroup() && admitted.length !== 2)
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  private async assertCommunity(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    const scope = this.scopeOf(record);
    const community = await this.communities.get(
      scope.communityId as string,
      () =>
        this.communityRepository.findById(
          new CommunityId(scope.communityId as string),
        ),
    );

    if (!community || community.getNetworkId().valueOf() !== record.networkId) {
      throw new InvalidPublicMutationError();
    }

    community.authorizeVoiceChannelCall(
      new IdentityId(authorIdentityId),
      new CommunityChannelId(scope.channelId as string),
    );

    const starts = await this.registry.queryDocuments(
      this.collection,
      (document) =>
        document.scopeType === 'call_start' &&
        document.id !== record.id &&
        (document.scope as Record<string, unknown>)?.communityId ===
          scope.communityId &&
        (document.scope as Record<string, unknown>)?.channelId ===
          scope.channelId,
    );
    const knownMax = starts.reduce(
      (max, start) =>
        Math.max(
          max,
          Number.isSafeInteger(start.sessionEpoch)
            ? (start.sessionEpoch as number)
            : 0,
        ),
      0,
    );

    if ((record.sessionEpoch as number) > knownMax + 1) {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    try {
      const creator = new IdentityId(record.creatorIdentityId as string);
      const nonce = new CallNonce(record.nonce as string);
      const callId = CallId.fromStart(creator, nonce).valueOf();

      if (
        record.callId !== callId ||
        record.id !== CallRecordIds.start(callId)
      ) {
        throw new InvalidPublicMutationError();
      }

      this.assertScopeShape(record);

      if (this.scopeOf(record).type === 'conversation') {
        this.assertConversationFields(record);
      } else {
        this.assertCommunityFields(record);
      }

      CallRecordClock.assertNotInFuture(record.startedAt);

      return {
        authorIdentityId: creator.valueOf(),
        recordId: record.id as string,
        store: this.collection,
      };
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion || record.creatorIdentityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    try {
      if (this.scopeOf(record).type === 'conversation') {
        await this.assertConversation(record, authorIdentityId);
      } else {
        await this.assertCommunity(record, authorIdentityId);
      }
    } catch {
      throw new InvalidPublicMutationError();
    }
  }
}
