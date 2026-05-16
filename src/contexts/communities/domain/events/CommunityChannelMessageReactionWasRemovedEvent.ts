import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityChannelMessageReactionRemovedEvent extends DomainEvent {
  public static EVENT_NAME =
    'communities.v1.channel.message.reaction.was_removed';

  public eventName(): string {
    return CommunityChannelMessageReactionRemovedEvent.EVENT_NAME;
  }
}
