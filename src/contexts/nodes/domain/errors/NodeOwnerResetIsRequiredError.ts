import { DomainError } from '@haskou/value-objects';

export class NodeOwnerResetIsRequiredError extends DomainError {
  constructor() {
    super(
      'Node owner must be reset by the node operator before the node can be claimed.',
    );
  }
}
