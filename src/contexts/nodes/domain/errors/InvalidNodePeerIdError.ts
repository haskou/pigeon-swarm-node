import { DomainError } from '@haskou/value-objects';

export class InvalidNodePeerIdError extends DomainError {
  constructor() {
    super('Node peer id is not a valid libp2p peer id.');
  }
}
