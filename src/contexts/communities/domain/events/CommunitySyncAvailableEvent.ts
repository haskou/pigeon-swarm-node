import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunitySyncAvailableEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.community.sync_available';

  public eventName(): string {
    return CommunitySyncAvailableEvent.EVENT_NAME;
  }
}
