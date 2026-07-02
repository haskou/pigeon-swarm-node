import { DomainError } from '@haskou/value-objects';

export class NodeRelayPortRangeRequiredError extends DomainError {
  constructor() {
    super('Node private relay needs a port range when it is enabled.');
  }
}
