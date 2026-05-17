import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityMembershipRequestWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.membership_request.was_created';

  public eventName(): string {
    return CommunityMembershipRequestWasCreatedEvent.EVENT_NAME;
  }
}
