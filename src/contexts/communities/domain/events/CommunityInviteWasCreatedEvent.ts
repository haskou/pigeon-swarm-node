import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CommunityInviteWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.invite.was_created';

  public eventName(): string {
    return CommunityInviteWasCreatedEvent.EVENT_NAME;
  }
}
