import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityInviteWasAcceptedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.invite.was_accepted';

  public eventName(): string {
    return CommunityInviteWasAcceptedEvent.EVENT_NAME;
  }
}
