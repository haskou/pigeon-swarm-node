import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class IdentityWasUpdatedEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.was_updated';

  public eventName(): string {
    return IdentityWasUpdatedEvent.EVENT_NAME;
  }
}
