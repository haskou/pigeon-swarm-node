import { DomainError } from '@haskou/value-objects';

export class NodeBlockListSignatureIsNotValidError extends DomainError {
  constructor() {
    super('Node block list signature does not verify against its owner.');
  }
}
