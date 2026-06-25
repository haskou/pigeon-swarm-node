import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelMessageWasUnpinnedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.message.was_unpinned';

  public eventName(): string {
    return CommunityChannelMessageWasUnpinnedEvent.EVENT_NAME;
  }
}
