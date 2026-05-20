import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

export type PollCreateOptionPrimitives = {
  id: string;
  text: string;
};

export class PollCreateMessage {
  public readonly allowsMultipleVotes: boolean;
  public readonly creatorIdentityId: IdentityId;
  public readonly expiresAt?: Timestamp;
  public readonly options: PollOption[];
  public readonly question: PollQuestion;
  public readonly recipients: {
    memberIds?: string[];
    participantIds?: string[];
  };

  public readonly scope: PollScope;

  constructor(
    creatorIdentityId: string,
    scope: PollScope,
    question: string,
    options: PollCreateOptionPrimitives[],
    allowsMultipleVotes: boolean,
    recipients: {
      memberIds?: string[];
      participantIds?: string[];
    },
    expiresAt?: number,
  ) {
    this.allowsMultipleVotes = allowsMultipleVotes;
    this.creatorIdentityId = new IdentityId(creatorIdentityId);
    this.expiresAt = expiresAt ? new Timestamp(expiresAt) : undefined;
    this.options = options.map((option) =>
      PollOption.create(
        new PollOptionId(option.id),
        new PollOptionText(option.text),
      ),
    );
    this.question = new PollQuestion(question);
    this.recipients = recipients;
    this.scope = scope;
  }
}
