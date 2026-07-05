import { DomainError } from '@haskou/value-objects';

export class InvalidNodeRelayPortError extends DomainError {
  constructor(port: number) {
    super(`Node relay port ${port} is not valid.`);
  }
}
