import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class PrivateControlOperationWasAcceptedEvent extends DomainEvent {
  public static EVENT_NAME =
    'private_authorization.v1.control_operation.was_accepted';

  public eventName(): string {
    return PrivateControlOperationWasAcceptedEvent.EVENT_NAME;
  }
}
