import { PollAudience } from '@app/contexts/polls/domain/PollAudience';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

export class PollCreateMessage {
  private readonly proof: PublicMutationProof;
  public readonly allowsMultipleVotes: boolean;
  public readonly audience: PollAudience;
  public readonly createdAt: Timestamp;
  public readonly creatorIdentityId: IdentityId;
  public readonly expiresAt?: Timestamp;
  public readonly options: PollOption[];
  public readonly pollId: PollId;
  public readonly question: PollQuestion;

  public readonly scope: PollScope;

  constructor(
    pollId: string,
    creatorIdentityId: string,
    scope: PollScope,
    definition: {
      allowsMultipleVotes: boolean;
      audience: PollAudience;
      expiresAt?: number;
      options: Array<{
        id: string;
        text: string;
      }>;
      question: string;
    },
    createdAt: number,
    proof: unknown,
  ) {
    this.allowsMultipleVotes = definition.allowsMultipleVotes;
    this.audience = definition.audience;
    this.createdAt = new Timestamp(createdAt);
    this.creatorIdentityId = new IdentityId(creatorIdentityId);
    this.expiresAt = definition.expiresAt
      ? new Timestamp(definition.expiresAt)
      : undefined;
    this.options = definition.options.map((option) =>
      PollOption.create(
        new PollOptionId(option.id),
        new PollOptionText(option.text),
      ),
    );
    this.pollId = new PollId(pollId);
    this.proof = PublicMutationProof.fromPrimitives(proof);
    this.question = new PollQuestion(definition.question);
    this.scope = scope;
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }
}
