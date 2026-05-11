import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class IdentitySyncAvailableEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.sync_available';

  public eventName(): string {
    return IdentitySyncAvailableEvent.EVENT_NAME;
  }
}
