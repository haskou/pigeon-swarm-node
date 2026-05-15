import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityMemberWasLeftEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.member.was_left';

  public eventName(): string {
    return CommunityMemberWasLeftEvent.EVENT_NAME;
  }
}
