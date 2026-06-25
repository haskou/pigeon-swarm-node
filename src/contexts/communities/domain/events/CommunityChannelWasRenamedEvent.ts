import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelWasRenamedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.was_renamed';

  public eventName(): string {
    return CommunityChannelWasRenamedEvent.EVENT_NAME;
  }
}
