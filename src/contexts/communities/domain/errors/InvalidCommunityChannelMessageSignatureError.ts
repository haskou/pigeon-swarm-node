import { DomainError } from '@haskou/value-objects';

export class InvalidCommunityChannelMessageSignatureError extends DomainError {
  constructor() {
    super('Community channel message signature is not valid.');
  }
}
