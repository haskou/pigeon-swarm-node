import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityWasUpdatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.community.was_updated';

  public eventName(): string {
    return CommunityWasUpdatedEvent.EVENT_NAME;
  }
}
