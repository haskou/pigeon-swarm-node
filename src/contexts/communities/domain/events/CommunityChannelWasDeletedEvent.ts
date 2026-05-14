import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityChannelWasDeletedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.was_deleted';

  public eventName(): string {
    return CommunityChannelWasDeletedEvent.EVENT_NAME;
  }
}
