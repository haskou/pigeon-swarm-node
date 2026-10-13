import { DomainError } from '@haskou/value-objects';

export class InvalidNodeCommunityStateAnnouncementError extends DomainError {
  constructor() {
    super('Node community state announcement has an invalid peer id.');
  }
}
