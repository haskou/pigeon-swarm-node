import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityMembershipRequestWasAcceptedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.membership_request.was_accepted';

  public eventName(): string {
    return CommunityMembershipRequestWasAcceptedEvent.EVENT_NAME;
  }
}
