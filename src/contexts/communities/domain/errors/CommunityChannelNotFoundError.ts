import { DomainError } from '@haskou/value-objects';

export class CommunityChannelNotFoundError extends DomainError {
  constructor() {
    super('Community channel not found');
  }
}
