import { DomainError } from '@haskou/value-objects';

export class InvalidNodeRelayPublicHostError extends DomainError {
  constructor(publicHost: string) {
    super(`Node relay public host "${publicHost}" is not valid.`);
  }
}
