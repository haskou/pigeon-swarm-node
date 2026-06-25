import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.was_created';

  public eventName(): string {
    return CommunityChannelWasCreatedEvent.EVENT_NAME;
  }
}
