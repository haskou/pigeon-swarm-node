import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelMessageReactionRemovedEvent extends DomainEvent {
  public static EVENT_NAME =
    'communities.v1.channel.message.reaction.was_removed';

  public eventName(): string {
    return CommunityChannelMessageReactionRemovedEvent.EVENT_NAME;
  }
}
