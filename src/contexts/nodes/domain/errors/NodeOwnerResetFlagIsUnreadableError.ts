import { DomainError } from '@haskou/value-objects';

export class NodeOwnerResetFlagIsUnreadableError extends DomainError {
  constructor() {
    super(
      'The stored owner reset marker cannot be read, so the node cannot start. The node operator must run `yarn node:reset-owner <new owner identity id>` to reset the owner.',
    );
  }
}
