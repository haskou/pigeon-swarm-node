import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class PrivateAuthorizationScopeWasPinnedEvent extends DomainEvent {
  public static EVENT_NAME = 'private_authorization.v1.scope.was_pinned';

  public eventName(): string {
    return PrivateAuthorizationScopeWasPinnedEvent.EVENT_NAME;
  }
}
