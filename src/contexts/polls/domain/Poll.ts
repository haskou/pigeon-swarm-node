import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { PollAlreadyClosedError } from './errors/PollAlreadyClosedError';
import { PollDuplicateOptionVoteError } from './errors/PollDuplicateOptionVoteError';
import { PollMultipleVotesNotAllowedError } from './errors/PollMultipleVotesNotAllowedError';
import { PollOptionNotFoundError } from './errors/PollOptionNotFoundError';
import { PollWasCreatedEvent } from './events/PollWasCreatedEvent';
import { PollAudience } from './PollAudience';
import { PollContent } from './PollContent';
import { PollLifecycle } from './PollLifecycle';
import { PollOption } from './PollOption';
import { PollScope } from './PollScope';
import { PollVote } from './PollVote';
import { PollId } from './value-objects/PollId';
import { PollOptionId } from './value-objects/PollOptionId';
import { PollQuestion } from './value-objects/PollQuestion';

export class Poll extends AggregateRoot {
  public static create(
    creatorIdentityId: IdentityId,
    scope: PollScope,
    question: PollQuestion,
    options: PollOption[],
    allowsMultipleVotes: boolean,
    expiresAt?: Timestamp,
    audience: PollAudience = PollAudience.empty(),
  ): Poll {
    const poll = new Poll(
      PollId.generate(),
      creatorIdentityId,
      scope,
      new PollContent(question, options),
      allowsMultipleVotes,
      PollLifecycle.open(expiresAt),
      [],
    );
    const primitives = poll.toPrimitives();
    const eventStreamId = scope.match({
      communityChannel: (communityId) => communityId.valueOf(),
      groupConversation: (conversationId) => conversationId.valueOf(),
    });

    poll.record(
      new PollWasCreatedEvent(eventStreamId, {
        ...audience.toPrimitives(),
        poll: primitives,
        pollId: primitives.id,
      }),
    );

    return poll;
  }

  public static fromPrimitives(primitives: PrimitiveOf<Poll>): Poll {
    return new Poll(
      new PollId(primitives.id),
      new IdentityId(primitives.creatorIdentityId),
      PollScope.fromPrimitives(primitives.scope),
      PollContent.fromPrimitives(primitives),
      primitives.allowsMultipleVotes,
      PollLifecycle.fromPrimitives(primitives),
      primitives.votes.map((vote) => PollVote.fromPrimitives(vote)),
    );
  }

  constructor(
    private readonly id: PollId,
    private readonly creatorIdentityId: IdentityId,
    private readonly scope: PollScope,
    private readonly content: PollContent,
    private readonly allowsMultipleVotes: boolean,
    private readonly lifecycle: PollLifecycle,
    private readonly votes: PollVote[],
  ) {
    super();
  }

  private assertOpen(timestamp: Timestamp = Timestamp.now()): void {
    assert(this.lifecycle.isOpenAt(timestamp), new PollAlreadyClosedError());
  }

  private assertOptionsExist(optionIds: PollOptionId[]): void {
    for (const optionId of optionIds) {
      assert(this.content.hasOption(optionId), new PollOptionNotFoundError());
    }
  }

  private assertUniqueOptions(optionIds: PollOptionId[]): void {
    optionIds.forEach((optionId, index) => {
      const firstIndex = optionIds.findIndex((candidate) =>
        candidate.isEqual(optionId),
      );

      assert(firstIndex === index, new PollDuplicateOptionVoteError());
    });
  }

  private removeVoteBy(voterIdentityId: IdentityId): void {
    const index = this.votes.findIndex((vote) =>
      vote.belongsTo(voterIdentityId),
    );

    if (index !== -1) {
      this.votes.splice(index, 1);
    }
  }

  public castVote(
    voterIdentityId: IdentityId,
    optionIds: PollOptionId[],
  ): void {
    this.assertOpen();
    assert(optionIds.length > 0, new PollOptionNotFoundError());
    assert(
      this.allowsMultipleVotes || optionIds.length === 1,
      new PollMultipleVotesNotAllowedError(),
    );
    this.assertUniqueOptions(optionIds);
    this.assertOptionsExist(optionIds);
    this.removeVoteBy(voterIdentityId);
    this.votes.push(PollVote.create(voterIdentityId, optionIds));
  }

  public close(): void {
    this.assertOpen();
    this.lifecycle.close();
  }

  public removeVote(voterIdentityId: IdentityId): void {
    this.removeVoteBy(voterIdentityId);
  }

  public getId(): PollId {
    return this.id;
  }

  public getScope(): PollScope {
    return this.scope;
  }

  public getCreatorIdentityId(): IdentityId {
    return this.creatorIdentityId;
  }

  public getCreatedAt(): Timestamp {
    return this.lifecycle.getCreatedAt();
  }

  public toPrimitives() {
    const scope = this.scope.toPrimitives();
    const lifecycle = this.lifecycle.toPrimitives();
    const content = this.content.toPrimitives();

    return {
      allowsMultipleVotes: this.allowsMultipleVotes,
      createdAt: lifecycle.createdAt,
      creatorIdentityId: this.creatorIdentityId.valueOf(),
      expiresAt: lifecycle.expiresAt,
      id: this.id.valueOf(),
      options: content.options,
      question: content.question,
      scope,
      status: lifecycle.status,
      votes: this.votes.map((vote) => vote.toPrimitives()),
    };
  }
}
