import { assert, PrimitiveOf } from '@haskou/value-objects';

import { InvalidPollOptionError } from './errors/InvalidPollOptionError';
import { PollOption } from './PollOption';
import { PollOptionId } from './value-objects/PollOptionId';
import { PollQuestion } from './value-objects/PollQuestion';

export class PollContent {
  public static fromPrimitives(primitives: {
    options: PrimitiveOf<PollOption>[];
    question: string;
  }): PollContent {
    return new PollContent(
      new PollQuestion(primitives.question),
      primitives.options.map((option) => PollOption.fromPrimitives(option)),
    );
  }

  constructor(
    private readonly question: PollQuestion,
    private readonly options: PollOption[],
  ) {
    this.assertValidOptions();
  }

  private assertValidOptions(): void {
    assert(this.options.length >= 2, new InvalidPollOptionError());
    assert(this.options.length <= 10, new InvalidPollOptionError());

    const hasDuplicateOptions = this.options.some((option, index) =>
      this.options
        .slice(index + 1)
        .some((candidate) => candidate.isIdentifiedBy(option.getId())),
    );

    assert(!hasDuplicateOptions, new InvalidPollOptionError());
  }

  public hasOption(optionId: PollOptionId): boolean {
    return this.options.some((option) => option.isIdentifiedBy(optionId));
  }

  public toPrimitives() {
    return {
      options: this.options.map((option) => option.toPrimitives()),
      question: this.question.valueOf(),
    };
  }
}
