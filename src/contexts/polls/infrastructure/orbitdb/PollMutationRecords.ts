import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { Poll } from '../../domain/Poll';
import { PollScope } from '../../domain/PollScope';
import { PollId } from '../../domain/value-objects/PollId';
import { PollOptionId } from '../../domain/value-objects/PollOptionId';

export interface PollVoteRecord {
  createdAt: number;
  optionIds: string[];
  pollId: string;
  voterIdentityId: string;
}

export interface PollCloseRecord {
  closedByIdentityId: string;
  createdAt: number;
  pollId: string;
}

/** Wire format of the signed `polls` records: definition, ballot and close. */
export default class PollMutationRecords {
  public static readonly POLL = 'poll';

  public static readonly VOTE = 'poll_vote';

  public static readonly CLOSE = 'poll_close';

  public static readonly SCOPE_FIELDS = [
    'channelId',
    'communityId',
    'conversationId',
  ];

  private static assertSameId(record: Record<string, unknown>, id: string) {
    if (record.id !== id) throw new InvalidPublicMutationError();
  }

  private static voteIdentity<
    T extends { pollId: string; voterIdentityId: string },
  >(record: Record<string, unknown>, vote: T): T {
    PollMutationRecords.assertSameId(
      record,
      PollMutationRecords.voteId(vote.pollId, vote.voterIdentityId),
    );

    return vote;
  }

  private static scopeTypeOf(
    record: Record<string, unknown>,
  ): 'community_channel' | 'group_conversation' | undefined {
    const { channelId, communityId, conversationId } = record;
    const hasCommunity =
      typeof communityId === 'string' && typeof channelId === 'string';
    const hasGroup = typeof conversationId === 'string';

    if (hasCommunity && conversationId === undefined) {
      return 'community_channel';
    }

    return hasGroup && communityId === undefined && channelId === undefined
      ? 'group_conversation'
      : undefined;
  }

  public static voteId(pollId: string, voterIdentityId: string): string {
    return `poll-vote:${new PollId(pollId).valueOf()}:${new IdentityId(voterIdentityId).valueOf()}`;
  }

  public static closeId(pollId: string): string {
    return `poll-close:${new PollId(pollId).valueOf()}`;
  }

  public static scopeFields(scope: PollScope): Record<string, string> {
    return scope.match<Record<string, string>>({
      communityChannel: (communityId, channelId) => ({
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
      }),
      groupConversation: (conversationId) => ({
        conversationId: conversationId.valueOf(),
      }),
    });
  }

  /** Throws unless the record names exactly one valid scope. */
  public static scopeOf(record: Record<string, unknown>): PollScope {
    const { channelId, communityId, conversationId } = record;
    const resolved = PollMutationRecords.scopeTypeOf(record);

    if (!resolved) throw new InvalidPublicMutationError();

    try {
      const scope = PollScope.fromPrimitives({
        channelId: channelId as string | undefined,
        communityId: communityId as string | undefined,
        conversationId: conversationId as string | undefined,
        type: resolved,
      });

      scope.match<void>({
        communityChannel: () => undefined,
        groupConversation: () => undefined,
      });

      return scope;
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public static pollPayload(poll: Poll): Record<string, unknown> {
    const primitives = poll.toPrimitives();

    return {
      allowsMultipleVotes: primitives.allowsMultipleVotes,
      ...PollMutationRecords.scopeFields(poll.getScope()),
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      ...(primitives.expiresAt === undefined
        ? {}
        : { expiresAt: primitives.expiresAt }),
      id: primitives.id,
      options: primitives.options,
      question: primitives.question,
      scopeType: PollMutationRecords.POLL,
    };
  }

  public static votePayload(
    poll: Poll,
    voterIdentityId: IdentityId,
  ): Record<string, unknown> {
    const primitives = poll.toPrimitives();
    const vote = primitives.votes.find(
      (candidate) => candidate.voterIdentityId === voterIdentityId.valueOf(),
    );

    if (!vote) {
      return {
        id: PollMutationRecords.voteId(
          primitives.id,
          voterIdentityId.valueOf(),
        ),
        pollId: primitives.id,
        removed: true,
        scopeType: PollMutationRecords.VOTE,
        voterIdentityId: voterIdentityId.valueOf(),
      };
    }

    return {
      ...PollMutationRecords.scopeFields(poll.getScope()),
      createdAt: vote.createdAt,
      id: PollMutationRecords.voteId(primitives.id, vote.voterIdentityId),
      optionIds: vote.optionIds,
      pollId: primitives.id,
      scopeType: PollMutationRecords.VOTE,
      voterIdentityId: vote.voterIdentityId,
    };
  }

  public static closePayload(
    poll: Poll,
    closedByIdentityId: IdentityId,
    closedAt: Timestamp,
  ): Record<string, unknown> {
    return {
      ...PollMutationRecords.scopeFields(poll.getScope()),
      closedByIdentityId: closedByIdentityId.valueOf(),
      createdAt: closedAt.valueOf(),
      id: PollMutationRecords.closeId(poll.getId().valueOf()),
      pollId: poll.getId().valueOf(),
      scopeType: PollMutationRecords.CLOSE,
    };
  }

  /** The open, vote-less poll that a definition record describes. */
  public static pollOf(record: Record<string, unknown>): Poll {
    try {
      const scope = PollMutationRecords.scopeOf(record);
      const poll = Poll.fromPrimitives({
        allowsMultipleVotes: record.allowsMultipleVotes as boolean,
        createdAt: record.createdAt as number,
        creatorIdentityId: record.creatorIdentityId as string,
        expiresAt: record.expiresAt as number | undefined,
        id: record.id as string,
        options: record.options as { id: string; text: string }[],
        question: record.question as string,
        scope: scope.toPrimitives(),
        status: 'open',
        votes: [],
      });
      const options = record.options as Record<string, unknown>[];

      if (
        !options.every(
          (option) =>
            Object.keys(option).sort().join() === 'id,text' &&
            typeof option.id === 'string' &&
            typeof option.text === 'string',
        )
      ) {
        throw new InvalidPublicMutationError();
      }
      PollMutationRecords.assertSameId(record, poll.getId().valueOf());

      return poll;
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  /** Put ballot; its tombstone carries no ballot. */
  public static voteOf(record: Record<string, unknown>): PollVoteRecord {
    try {
      PollMutationRecords.scopeOf(record);
      const optionIds = record.optionIds as unknown[];

      if (
        optionIds.length === 0 ||
        optionIds.length > 10 ||
        !optionIds.every((id) => typeof id === 'string') ||
        new Set(optionIds).size !== optionIds.length
      ) {
        throw new InvalidPublicMutationError();
      }
      (optionIds as string[]).forEach((id) => new PollOptionId(id));

      return PollMutationRecords.voteIdentity(record, {
        createdAt: record.createdAt as number,
        optionIds: optionIds as string[],
        pollId: record.pollId as string,
        voterIdentityId: record.voterIdentityId as string,
      });
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public static voteTombstoneOf(
    record: Record<string, unknown>,
  ): Pick<PollVoteRecord, 'pollId' | 'voterIdentityId'> {
    try {
      return PollMutationRecords.voteIdentity(record, {
        pollId: record.pollId as string,
        voterIdentityId: record.voterIdentityId as string,
      });
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public static closeOf(record: Record<string, unknown>): PollCloseRecord {
    try {
      PollMutationRecords.scopeOf(record);
      const close = {
        closedByIdentityId: new IdentityId(
          record.closedByIdentityId as string,
        ).valueOf(),
        createdAt: record.createdAt as number,
        pollId: new PollId(record.pollId as string).valueOf(),
      };

      PollMutationRecords.assertSameId(
        record,
        PollMutationRecords.closeId(close.pollId),
      );

      return close;
    } catch {
      throw new InvalidPublicMutationError();
    }
  }
}
