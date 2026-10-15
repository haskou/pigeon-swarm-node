import { DomainError } from '@haskou/value-objects';

export class InvalidConversationDraftKeyError extends DomainError {
  constructor() {
    super('Conversation draft key is not a base64url HMAC-SHA256 digest.');
  }
}
