import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityChannelMessageWasDeletedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.message.was_deleted';

  public eventName(): string {
    return CommunityChannelMessageWasDeletedEvent.EVENT_NAME;
  }
}
