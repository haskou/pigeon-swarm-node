import { DomainError } from '@haskou/value-objects';

export class NodeMetadataIsUnreadableError extends DomainError {
  constructor() {
    super(
      'The stored node configuration cannot be read, so the node cannot start. It is left as stored and is never regenerated; the node operator must restore it before the node can start.',
    );
  }
}
