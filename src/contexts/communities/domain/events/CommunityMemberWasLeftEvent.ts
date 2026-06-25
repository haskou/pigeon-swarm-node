import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityMemberWasLeftEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.member.was_left';

  public eventName(): string {
    return CommunityMemberWasLeftEvent.EVENT_NAME;
  }
}
