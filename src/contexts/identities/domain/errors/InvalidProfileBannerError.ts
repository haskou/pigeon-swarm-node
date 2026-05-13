import { DomainError } from '@haskou/value-objects';

export class InvalidProfileBannerError extends DomainError {
  constructor() {
    super('Profile banner must be a public IPFS CID.');
  }
}
