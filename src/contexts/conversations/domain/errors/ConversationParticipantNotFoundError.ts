import BaseError from '@app/shared/domain/errors/BaseError';

export class ConversationParticipantNotFoundError extends BaseError {
  constructor() {
    super(
      'Message author must be a conversation participant',
      ConversationParticipantNotFoundError.prototype,
    );
  }
}
