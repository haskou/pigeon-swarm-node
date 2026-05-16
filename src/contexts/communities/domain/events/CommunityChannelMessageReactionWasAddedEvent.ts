import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityChannelMessageReactionWasAddedEvent extends DomainEvent {
  public static EVENT_NAME =
    'communities.v1.channel.message.reaction.was_added';

  public eventName(): string {
    return CommunityChannelMessageReactionWasAddedEvent.EVENT_NAME;
  }
}
