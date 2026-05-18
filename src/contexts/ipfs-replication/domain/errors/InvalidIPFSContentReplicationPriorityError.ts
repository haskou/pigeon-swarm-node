import { DomainError } from '@haskou/value-objects';

export class InvalidIPFSContentReplicationPriorityError extends DomainError {
  constructor(value: string) {
    super(`Invalid IPFS content replication priority: ${value}`);
  }
}
