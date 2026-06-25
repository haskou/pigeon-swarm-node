import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelMessageWasPinnedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.message.was_pinned';

  public eventName(): string {
    return CommunityChannelMessageWasPinnedEvent.EVENT_NAME;
  }
}
