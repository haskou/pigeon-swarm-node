import BaseError from '@app/shared/domain/errors/BaseError';

// eslint-disable-next-line max-len
export class ConversationMustHaveTwoDifferentParticipantsError extends BaseError {
  constructor() {
    super(
      'One-to-one conversations must have two different participants',
      ConversationMustHaveTwoDifferentParticipantsError.prototype,
    );
  }
}
