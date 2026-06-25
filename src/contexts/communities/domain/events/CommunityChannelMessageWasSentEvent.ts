import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelMessageWasSentEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.message.was_sent';

  public eventName(): string {
    return CommunityChannelMessageWasSentEvent.EVENT_NAME;
  }
}
