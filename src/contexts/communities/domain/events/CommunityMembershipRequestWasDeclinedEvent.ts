import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityMembershipRequestWasDeclinedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.membership_request.was_declined';

  public eventName(): string {
    return CommunityMembershipRequestWasDeclinedEvent.EVENT_NAME;
  }
}
