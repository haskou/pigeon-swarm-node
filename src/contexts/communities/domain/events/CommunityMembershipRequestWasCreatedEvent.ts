import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityMembershipRequestWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.membership_request.was_created';

  public eventName(): string {
    return CommunityMembershipRequestWasCreatedEvent.EVENT_NAME;
  }
}
