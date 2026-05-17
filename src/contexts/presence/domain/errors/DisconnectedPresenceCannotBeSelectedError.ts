import { DomainError } from '@haskou/value-objects';

export class DisconnectedPresenceCannotBeSelectedError extends DomainError {
  constructor() {
    super('Disconnected presence is derived by heartbeat timeout.');
  }
}
