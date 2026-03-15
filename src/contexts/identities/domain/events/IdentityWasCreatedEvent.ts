import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class IdentityWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.was_created';

  public eventName(): string {
    return IdentityWasCreatedEvent.EVENT_NAME;
  }
}
