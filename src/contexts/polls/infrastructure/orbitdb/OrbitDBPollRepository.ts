import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollId } from '../../domain/value-objects/PollId';
import { PollOptionId } from '../../domain/value-objects/PollOptionId';
import PollMutationRecords from './PollMutationRecords';

type PollRecord = Record<string, unknown>;

/**
 * Polls live in the signed `polls` store as three kinds of record: the
 * creator's definition, one ballot per voter and an optional close record.
 * `poll:<id>` holds every record of a poll; the scope indexes only definitions.
 */
export default class OrbitDBPollRepository extends PollRepository {
  private readonly pollIndex: OrbitDBHeadIndex<PollRecord>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly communityRepository: CommunityRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.pollIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'polls',
      documentFromRecord: (record) =>
        this.isRecord(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
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

  private isRecord(record: PollRecord): boolean {
    try {
      if (record.scopeType === PollMutationRecords.POLL) {
        PollMutationRecords.pollOf(record);
      } else if (record.scopeType === PollMutationRecords.VOTE) {
        if (record.removed === true) {
          PollMutationRecords.voteTombstoneOf(record);
        } else {
          PollMutationRecords.voteOf(record);
        }
      } else if (record.scopeType === PollMutationRecords.CLOSE) {
        PollMutationRecords.closeOf(record);
      } else {
        return false;
      }

      return true;
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

  private scopeIndexKey(poll: Poll): string {
    return poll.getScope().match<string>({
      communityChannel: (communityId, channelId) =>
        this.communityChannelIndexHeadKey(
          communityId.valueOf(),
          channelId.valueOf(),
        ),
      groupConversation: (conversationId) =>
        this.groupConversationIndexHeadKey(conversationId.valueOf()),
    });
  }

  private sameScope(record: PollRecord, poll: Poll): boolean {
    try {
      return PollMutationRecords.scopeOf(record).isEqual(poll.getScope());
    } catch {
      return false;
    }
  }

  /** Replays the ballots and the close record of a poll over its definition. */
  private assemble(definition: PollRecord, records: PollRecord[]): Poll {
    const poll = PollMutationRecords.pollOf(definition);
    const pollId = poll.getId().valueOf();
    const belongs = (record: PollRecord, scopeType: string): boolean =>
      record.scopeType === scopeType &&
      record.pollId === pollId &&
      record.removed !== true &&
      this.isRecord(record) &&
      this.sameScope(record, poll);
    const closes = records
      .filter((record) => belongs(record, PollMutationRecords.CLOSE))
      .map((record) => PollMutationRecords.closeOf(record).createdAt);
    const closedAt = closes.length > 0 ? Math.min(...closes) : undefined;
    const ballots = records
      .filter((record) => belongs(record, PollMutationRecords.VOTE))
      .map((record) => PollMutationRecords.voteOf(record))
      .filter(
        (ballot) => closedAt === undefined || ballot.createdAt <= closedAt,
      )
      .sort((left, right) => left.createdAt - right.createdAt);

    for (const ballot of ballots) {
      try {
        poll.castVote(
          new IdentityId(ballot.voterIdentityId),
          ballot.optionIds.map((id) => new PollOptionId(id)),
          new Timestamp(ballot.createdAt),
        );
      } catch {
        // A ballot the poll rules reject is ignored, not fatal.
      }
    }

    if (closedAt !== undefined) {
      try {
        poll.close(new Timestamp(closedAt));
      } catch {
        // Already expired before it was closed.
      }
    }

    return poll;
  }

  private definitionOf(records: PollRecord[]): PollRecord | undefined {
    return records.find(
      (record) =>
        record.scopeType === PollMutationRecords.POLL && this.isRecord(record),
    );
  }

  private async load(pollId: string): Promise<Poll | undefined> {
    const records = await this.pollIndex.findRecords(this.pollHeadKey(pollId));
    const definition = this.definitionOf(records);

    return definition ? this.assemble(definition, records) : undefined;
  }

  private async loadMany(
    indexKey: string,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    const definitions = (await this.pollIndex.findRecords(indexKey))
      .filter((record) => record.scopeType === PollMutationRecords.POLL)
      .filter((record) => this.isRecord(record))
      .filter((record) =>
        beforeCreatedAt
          ? (record.createdAt as number) <= beforeCreatedAt
          : true,
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? (right.id as string).localeCompare(left.id as string)
          : (right.createdAt as number) - (left.createdAt as number),
      )
      .slice(0, limit);
    const polls = await Promise.all(
      definitions.map(async (definition) =>
        this.assemble(
          definition,
          await this.pollIndex.findRecords(
            this.pollHeadKey(definition.id as string),
          ),
        ),
      ),
    );

    return polls;
  }

  private async write(
    poll: Poll,
    payload: PollRecord,
    proof: PublicMutationProof,
    isDefinition = false,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);
    const networkId = await this.resolveNetworkId(poll);
    const pollKey = this.pollHeadKey(poll.getId().valueOf());

    await this.runWhilePublicCommunityScope(poll, async () => {
      PublicMutationRecord.assertNotStale(
        (await this.pollIndex.findRecords(pollKey)).filter(
          (stored) => stored.id === payload.id,
        ),
        document,
      );
      await this.registry.putDocument('polls', document, [networkId]);
      await this.pollIndex.putRecord(
        pollKey,
        { id: pollKey },
        document,
        [networkId],
        { replace: true },
      );

      if (isDefinition) {
        const indexKey = this.scopeIndexKey(poll);

        await this.pollIndex.putRecord(
          indexKey,
          { id: indexKey },
          document,
          [networkId],
          {
            recordFilter: (record) =>
              record.scopeType === PollMutationRecords.POLL,
            replace: true,
          },
        );
      }
    });
  }

  public async findById(id: PollId): Promise<Poll | undefined> {
    const poll = await this.load(id.valueOf());

    if (!poll) return undefined;

    return this.runWhilePublicCommunityScope(poll, async () => {
      const locked = await this.load(id.valueOf());

      return locked?.getScope().isEqual(poll.getScope()) ? locked : undefined;
    });
  }

  public findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, () =>
      this.loadMany(
        this.communityChannelIndexHeadKey(
          communityId.valueOf(),
          channelId.valueOf(),
        ),
        limit,
        beforeCreatedAt,
      ),
    );
  }

  public findByGroupConversation(
    conversationId: ConversationId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]> {
    return this.loadMany(
      this.groupConversationIndexHeadKey(conversationId.valueOf()),
      limit,
      beforeCreatedAt,
    );
  }

  public save(poll: Poll, proof: PublicMutationProof): Promise<void> {
    return this.write(poll, PollMutationRecords.pollPayload(poll), proof, true);
  }

  public saveVote(
    poll: Poll,
    voterIdentityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void> {
    return this.write(
      poll,
      PollMutationRecords.votePayload(poll, voterIdentityId),
      proof,
    );
  }

  public saveClose(
    poll: Poll,
    closedByIdentityId: IdentityId,
    closedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    return this.write(
      poll,
      PollMutationRecords.closePayload(poll, closedByIdentityId, closedAt),
      proof,
    );
  }
}
