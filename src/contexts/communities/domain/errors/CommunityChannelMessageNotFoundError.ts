import { DomainError } from '@haskou/value-objects';

export class CommunityChannelMessageNotFoundError extends DomainError {
  constructor() {
    super('Community channel message not found');
  }
}
