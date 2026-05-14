import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityChannelWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.was_created';

  public eventName(): string {
    return CommunityChannelWasCreatedEvent.EVENT_NAME;
  }
}
