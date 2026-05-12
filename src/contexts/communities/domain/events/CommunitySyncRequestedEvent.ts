import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunitySyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.community.sync_requested';

  public eventName(): string {
    return CommunitySyncRequestedEvent.EVENT_NAME;
  }
}
