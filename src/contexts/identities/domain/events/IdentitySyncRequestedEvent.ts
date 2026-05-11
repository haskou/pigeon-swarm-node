import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class IdentitySyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.sync_requested';

  public eventName(): string {
    return IdentitySyncRequestedEvent.EVENT_NAME;
  }
}
