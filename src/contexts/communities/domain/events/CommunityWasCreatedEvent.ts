import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.community.was_created';

  public eventName(): string {
    return CommunityWasCreatedEvent.EVENT_NAME;
  }
}
