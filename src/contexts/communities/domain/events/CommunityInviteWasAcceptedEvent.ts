import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityInviteWasAcceptedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.invite.was_accepted';

  public eventName(): string {
    return CommunityInviteWasAcceptedEvent.EVENT_NAME;
  }
}
