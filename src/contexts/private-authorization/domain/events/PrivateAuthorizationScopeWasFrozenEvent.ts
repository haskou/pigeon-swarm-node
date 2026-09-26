import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class PrivateAuthorizationScopeWasFrozenEvent extends DomainEvent {
  public static EVENT_NAME = 'private_authorization.v1.scope.was_frozen';

  public eventName(): string {
    return PrivateAuthorizationScopeWasFrozenEvent.EVENT_NAME;
  }
}
