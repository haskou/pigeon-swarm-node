import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelMessageReactionWasAddedEvent extends DomainEvent {
  public static EVENT_NAME =
    'communities.v1.channel.message.reaction.was_added';

  public eventName(): string {
    return CommunityChannelMessageReactionWasAddedEvent.EVENT_NAME;
  }
}
