import { DomainError } from '@haskou/value-objects';

export class InvalidNodePeerNetworkTypeError extends DomainError {
  constructor(type: string) {
    super(`Node peer network type ${type} is not valid.`);
  }
}
