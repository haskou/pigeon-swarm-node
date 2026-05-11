import { DomainError } from '@haskou/value-objects';

export class InvalidProfileImageError extends DomainError {
  constructor() {
    super('Profile image must be a public IPFS CID.');
  }
}
