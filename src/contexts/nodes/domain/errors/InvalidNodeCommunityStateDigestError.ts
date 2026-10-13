import { DomainError } from '@haskou/value-objects';

export class InvalidNodeCommunityStateDigestError extends DomainError {
  constructor() {
    super('Node community state digest is not a base64url SHA-256 digest.');
  }
}
