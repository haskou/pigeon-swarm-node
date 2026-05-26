import { DomainError } from '@haskou/value-objects';

export class CommunityChannelMessagePayloadMismatchError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
