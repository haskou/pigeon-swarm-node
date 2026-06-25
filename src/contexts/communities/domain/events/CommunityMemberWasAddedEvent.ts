import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityMemberWasAddedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.member.was_added';

  public eventName(): string {
    return CommunityMemberWasAddedEvent.EVENT_NAME;
  }
}
