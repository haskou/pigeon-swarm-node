import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityChannelMessageWasEditedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.message.was_edited';

  public eventName(): string {
    return CommunityChannelMessageWasEditedEvent.EVENT_NAME;
  }
}
